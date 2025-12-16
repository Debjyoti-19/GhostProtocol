import { EventRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { 
  WorkflowStateError 
} from '../errors/index.js'

// Input schema for Identity Critical Orchestrator event
const IdentityCriticalOrchestratorInputSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  userIdentifiers: z.object({
    userId: z.string().min(1, 'User ID is required'),
    emails: z.array(z.string().email('Invalid email format')),
    phones: z.array(z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone format')),
    aliases: z.array(z.string().min(1, 'Alias cannot be empty'))
  })
})

// Response schema for Identity Critical Orchestrator
const IdentityCriticalOrchestratorResponseSchema = z.object({
  success: z.boolean(),
  workflowId: z.string(),
  phase: z.string(),
  triggeredSteps: z.array(z.string()),
  timestamp: z.string().datetime()
})

export const config: EventRouteConfig = {
  name: 'IdentityCriticalOrchestrator',
  type: 'event',
  topic: 'workflow-created',
  description: 'Orchestrate identity-critical deletion steps with sequential ordering enforcement',
  emits: [
    {
      topic: 'stripe-deletion',
      label: 'Trigger Stripe Deletion',
      conditional: false
    },
    {
      topic: 'audit-log',
      label: 'Audit Log Entry',
      conditional: false
    }
  ],
  flows: ['erasure-workflow'],
  inputSchema: IdentityCriticalOrchestratorInputSchema,
  outputSchema: IdentityCriticalOrchestratorResponseSchema
}

export const handler: Handlers['IdentityCriticalOrchestrator'] = async (data, { emit, logger, state }) => {
  const { workflowId, userIdentifiers } = IdentityCriticalOrchestratorInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Starting identity-critical orchestration', { 
    workflowId, 
    userId: userIdentifiers.userId 
  })

  try {
    // Get current workflow state
    const workflowState = await state.get(`workflow:${workflowId}`)
    if (!workflowState) {
      throw new WorkflowStateError(workflowId, `Workflow not found`)
    }

    // Ensure workflow is in correct state to begin identity-critical phase
    if (workflowState.status !== 'IN_PROGRESS') {
      throw new WorkflowStateError(
        workflowId,
        `Workflow is not in progress. Current status: ${workflowState.status}`
      )
    }

    // Mark the beginning of identity-critical phase
    workflowState.currentPhase = 'identity-critical'
    workflowState.identityCriticalStartedAt = timestamp

    // Save updated state
    await state.set(`workflow:${workflowId}`, workflowState)

    logger.info('Identity-critical phase started, triggering Stripe deletion', { 
      workflowId, 
      userId: userIdentifiers.userId 
    })

    // Emit audit log for phase start
    await emit({
      topic: 'audit-log',
      data: {
        event: 'IDENTITY_CRITICAL_PHASE_STARTED',
        workflowId,
        userIdentifiers,
        phase: 'identity-critical',
        timestamp
      }
    })

    // Trigger the first step in the sequential chain: Stripe deletion
    // Database deletion will be triggered automatically after Stripe completes
    await emit({
      topic: 'stripe-deletion',
      data: {
        workflowId,
        userIdentifiers,
        stepName: 'stripe-deletion',
        attempt: 1
      }
    })

    return {
      success: true,
      workflowId,
      phase: 'identity-critical',
      triggeredSteps: ['stripe-deletion'],
      timestamp
    }

  } catch (error) {
    logger.error('Identity-critical orchestration failed', { 
      workflowId, 
      userId: userIdentifiers.userId,
      error: error.message 
    })

    // Emit audit log for orchestration failure
    await emit({
      topic: 'audit-log',
      data: {
        event: 'IDENTITY_CRITICAL_ORCHESTRATION_FAILED',
        workflowId,
        userIdentifiers,
        error: error.message,
        timestamp
      }
    })

    throw error
  }
}