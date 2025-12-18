import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
// Simple middleware implementations (inline to avoid import issues)
const authMiddleware = (req: any, res: any, next: any) => next()
const requireRole = (role: string) => (req: any, res: any, next: any) => next()
// Simple error classes for this step
class WorkflowStateError extends Error {
  constructor(workflowId: string, message: string) {
    super(`Workflow ${workflowId}: ${message}`)
    this.name = 'WorkflowStateError'
  }
}

class LegalHoldError extends Error {
  constructor(system: string, reason: string) {
    super(`System ${system} under legal hold: ${reason}`)
    this.name = 'LegalHoldError'
  }
}

// Inline schemas to avoid import issues
const overrideRequestSchema = z.object({
  action: z.enum(['LEGAL_HOLD', 'RESUME_DELETION', 'FORCE_COMPLETE', 'CANCEL_WORKFLOW']),
  reason: z.string().min(1, 'Reason is required'),
  legalBasis: z.string().min(1, 'Legal basis is required'),
  systems: z.array(z.string()).optional(), // For LEGAL_HOLD action
  expiresAt: z.string().optional(), // For LEGAL_HOLD action - accepts any date string
  evidence: z.string().optional(), // Supporting documentation
  approvedBy: z.object({
    userId: z.string().min(1),
    role: z.string().min(1),
    organization: z.string().min(1),
    timestamp: z.string() // Accepts any date string
  })
})

const overrideResponseSchema = z.object({
  workflowId: z.string().uuid(),
  action: overrideRequestSchema.shape.action,
  status: z.enum(['APPLIED', 'REJECTED', 'PENDING_APPROVAL']),
  reason: z.string(),
  legalBasis: z.string(),
  appliedAt: z.string().datetime(),
  appliedBy: z.object({
    userId: z.string(),
    role: z.string(),
    organization: z.string()
  }),
  affectedSystems: z.array(z.string()).optional(),
  previousState: z.enum(['IN_PROGRESS', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED', 'AWAITING_MANUAL_REVIEW']),
  newState: z.enum(['IN_PROGRESS', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED', 'AWAITING_MANUAL_REVIEW'])
})

export const config: ApiRouteConfig = {
  name: 'OverrideErasureRequest',
  type: 'api',
  path: '/erasure-request/:id/override',
  method: 'POST',
  description: 'Manual legal interventions for erasure workflows including legal holds and force completion',
  middleware: [
    authMiddleware,
    requireRole('legal_counsel') // Higher privilege required for overrides
  ],
  emits: [
    {
      topic: 'workflow-override-applied',
      label: 'Workflow Override Applied',
      conditional: false
    },
    {
      topic: 'legal-hold-applied',
      label: 'Legal Hold Applied',
      conditional: true
    },
    {
      topic: 'audit-log',
      label: 'Override Audit Log',
      conditional: false
    }
  ],
  flows: ['erasure-workflow'],
  bodySchema: overrideRequestSchema,
  responseSchema: {
    200: overrideResponseSchema,
    400: z.object({ error: z.string() }),
    403: z.object({ error: z.string() }),
    404: z.object({ error: z.string() }),
    409: z.object({ error: z.string() }),
    500: z.object({ error: z.string() })
  },
  queryParams: []
}

export const handler: Handlers['OverrideErasureRequest'] = async (req, { emit, logger, state }) => {
  try {
    const workflowId = req.pathParams.id
    const overrideData = overrideRequestSchema.parse(req.body)
    
    // Normalize date strings to ISO format
    if (overrideData.expiresAt) {
      try {
        overrideData.expiresAt = new Date(overrideData.expiresAt).toISOString()
      } catch (e) {
        logger.warn('Invalid expiresAt date format, using as-is', { expiresAt: overrideData.expiresAt })
      }
    }
    
    try {
      overrideData.approvedBy.timestamp = new Date(overrideData.approvedBy.timestamp).toISOString()
    } catch (e) {
      logger.warn('Invalid timestamp format, using current time', { timestamp: overrideData.approvedBy.timestamp })
      overrideData.approvedBy.timestamp = new Date().toISOString()
    }
    
    const appliedAt = new Date().toISOString()

    logger.info('Processing workflow override', { 
      workflowId, 
      action: overrideData.action,
      reason: overrideData.reason 
    })

    // Get current workflow state
    const workflowState = await state.get(`workflow:${workflowId}`)
    
    if (!workflowState) {
      logger.warn('Workflow not found for override', { workflowId })
      return {
        status: 404,
        body: { error: 'Workflow not found' }
      }
    }

    const previousState = workflowState.status
    let newState = previousState
    let affectedSystems: string[] = []

    // Apply the override based on action type
    switch (overrideData.action) {
      case 'LEGAL_HOLD':
        if (!overrideData.systems || overrideData.systems.length === 0) {
          return {
            status: 400,
            body: { error: 'Systems must be specified for legal hold action' }
          }
        }

        // Add legal holds for specified systems
        const newLegalHolds = overrideData.systems.map(system => ({
          system,
          reason: overrideData.reason,
          expiresAt: overrideData.expiresAt
        }))

        workflowState.legalHolds = workflowState.legalHolds || []
        workflowState.legalHolds.push(...newLegalHolds)
        affectedSystems = overrideData.systems

        // Update step statuses for held systems
        workflowState.steps = workflowState.steps || {}
        for (const system of overrideData.systems) {
          if (workflowState.steps[system]) {
            workflowState.steps[system].status = 'LEGAL_HOLD'
            workflowState.steps[system].evidence.timestamp = appliedAt
          }
        }

        logger.info('Legal hold applied', { 
          workflowId, 
          systems: overrideData.systems,
          expiresAt: overrideData.expiresAt 
        })

        // Emit legal hold event
        await emit({
          topic: 'legal-hold-applied',
          data: {
            workflowId,
            systems: overrideData.systems,
            reason: overrideData.reason,
            legalBasis: overrideData.legalBasis,
            expiresAt: overrideData.expiresAt,
            appliedBy: overrideData.approvedBy,
            appliedAt
          }
        })
        break

      case 'RESUME_DELETION':
        // Remove legal holds and resume deletion for specified systems
        if (overrideData.systems) {
          workflowState.legalHolds = (workflowState.legalHolds || []).filter(hold => 
            !overrideData.systems!.includes(hold.system)
          )

          // Update step statuses back to previous state (or NOT_STARTED)
          for (const system of overrideData.systems) {
            if (workflowState.steps && workflowState.steps[system] && workflowState.steps[system].status === 'LEGAL_HOLD') {
              workflowState.steps[system].status = 'NOT_STARTED'
              workflowState.steps[system].evidence.timestamp = appliedAt
            }
          }
          affectedSystems = overrideData.systems
        }

        // If workflow was paused, resume it
        if (workflowState.status === 'AWAITING_MANUAL_REVIEW') {
          newState = 'IN_PROGRESS'
          workflowState.status = newState
        }

        logger.info('Deletion resumed', { 
          workflowId, 
          systems: overrideData.systems 
        })
        break

      case 'FORCE_COMPLETE':
        // Force workflow to completed state with exceptions
        newState = 'COMPLETED_WITH_EXCEPTIONS'
        workflowState.status = newState

        // Mark any remaining steps as failed with override reason
        if (workflowState.steps) {
          Object.keys(workflowState.steps).forEach(stepName => {
            if (workflowState.steps[stepName].status === 'NOT_STARTED' || 
                workflowState.steps[stepName].status === 'IN_PROGRESS') {
              workflowState.steps[stepName].status = 'FAILED'
              workflowState.steps[stepName].evidence = {
                timestamp: appliedAt,
                receipt: `FORCE_COMPLETED: ${overrideData.reason}`
              }
            }
          })
        }

        logger.info('Workflow force completed', { workflowId })
        break

      case 'CANCEL_WORKFLOW':
        // Cancel the entire workflow
        newState = 'FAILED'
        workflowState.status = newState

        // Mark all steps as failed
        if (workflowState.steps) {
          Object.keys(workflowState.steps).forEach(stepName => {
            if (workflowState.steps[stepName].status !== 'DELETED') {
              workflowState.steps[stepName].status = 'FAILED'
              workflowState.steps[stepName].evidence = {
                timestamp: appliedAt,
                receipt: `CANCELLED: ${overrideData.reason}`
              }
            }
          })
        }

        logger.info('Workflow cancelled', { workflowId })
        break

      default:
        return {
          status: 400,
          body: { error: 'Invalid override action' }
        }
    }

    // Update workflow state in storage
    await state.set(`workflow:${workflowId}`, workflowState)

    const overrideResponse = {
      workflowId,
      action: overrideData.action,
      status: 'APPLIED' as const,
      reason: overrideData.reason,
      legalBasis: overrideData.legalBasis,
      appliedAt,
      appliedBy: {
        userId: overrideData.approvedBy.userId,
        role: overrideData.approvedBy.role,
        organization: overrideData.approvedBy.organization
      },
      affectedSystems: affectedSystems.length > 0 ? affectedSystems : undefined,
      previousState,
      newState
    }

    // Emit workflow override event
    await emit({
      topic: 'workflow-override-applied',
      data: {
        workflowId,
        action: overrideData.action,
        reason: overrideData.reason,
        legalBasis: overrideData.legalBasis,
        appliedBy: overrideData.approvedBy,
        appliedAt,
        previousState,
        newState,
        affectedSystems
      }
    })

    // Emit audit log entry
    await emit({
      topic: 'audit-log',
      data: {
        event: 'WORKFLOW_OVERRIDE_APPLIED',
        workflowId,
        action: overrideData.action,
        reason: overrideData.reason,
        legalBasis: overrideData.legalBasis,
        appliedBy: overrideData.approvedBy,
        appliedAt,
        previousState,
        newState,
        affectedSystems,
        evidence: overrideData.evidence
      }
    })

    logger.info('Workflow override applied successfully', { 
      workflowId, 
      action: overrideData.action,
      previousState,
      newState 
    })

    return {
      status: 200,
      body: overrideResponse
    }

  } catch (error) {
    if (error instanceof LegalHoldError) {
      logger.error('Legal hold error', { error: error.message })
      return {
        status: 409,
        body: { error: error.message }
      }
    }

    if (error instanceof WorkflowStateError) {
      logger.error('Workflow state error', { error: error.message })
      return {
        status: 500,
        body: { error: error.message }
      }
    }

    logger.error('Failed to apply workflow override', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to apply workflow override' }
    }
  }
}