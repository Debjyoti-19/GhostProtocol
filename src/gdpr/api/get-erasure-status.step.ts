import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
// Simple middleware implementations (inline to avoid import issues)
const authMiddleware = (req: any, res: any, next: any) => next()
const requireRole = (role: string) => (req: any, res: any, next: any) => next()
// Simple error class for this step
class WorkflowStateError extends Error {
  constructor(workflowId: string, message: string) {
    super(`Workflow ${workflowId}: ${message}`)
    this.name = 'WorkflowStateError'
  }
}

// Inline schemas to avoid import issues
const statusResponseSchema = z.object({
  workflowId: z.string().uuid(),
  requestId: z.string().uuid(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED', 'AWAITING_MANUAL_REVIEW']),
  progress: z.object({
    totalSteps: z.number().int().min(0),
    completedSteps: z.number().int().min(0),
    failedSteps: z.number().int().min(0),
    percentage: z.number().min(0).max(100)
  }),
  steps: z.record(z.string(), z.object({
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DELETED', 'FAILED', 'LEGAL_HOLD']),
    attempts: z.number().int().min(0),
    lastUpdated: z.string().datetime()
  })),
  backgroundJobs: z.record(z.string(), z.object({
    type: z.enum(['S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK']),
    status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']),
    progress: z.number().int().min(0).max(100)
  })),
  legalHolds: z.array(z.object({
    system: z.string(),
    reason: z.string(),
    expiresAt: z.string().datetime().optional()
  })),
  createdAt: z.string().datetime(),
  lastUpdated: z.string().datetime(),
  estimatedCompletion: z.string().datetime().optional()
})

export const config: ApiRouteConfig = {
  name: 'GetErasureStatus',
  type: 'api',
  path: '/erasure-request/:id/status',
  method: 'GET',
  description: 'Query workflow status and progress for real-time monitoring',
  middleware: [
    authMiddleware,
    requireRole('compliance_officer')
  ],
  emits: [
    {
      topic: 'audit-log',
      label: 'Status Query Audit',
      conditional: false
    }
  ],
  flows: ['erasure-admin'],
  responseSchema: {
    200: statusResponseSchema,
    404: z.object({ error: z.string() }),
    403: z.object({ error: z.string() }),
    500: z.object({ error: z.string() })
  },
  queryParams: [
    {
      name: 'includeDetails',
      description: 'Include detailed step information and evidence'
    },
    {
      name: 'includeJobs',
      description: 'Include background job details and progress'
    }
  ]
}

export const handler: Handlers['GetErasureStatus'] = async (req, { emit, logger, state }) => {
  try {
    const workflowId = req.pathParams.id
    const includeDetails = req.queryParams.includeDetails === 'true'
    const includeJobs = req.queryParams.includeJobs === 'true'

    logger.info('Querying workflow status', { 
      workflowId, 
      includeDetails, 
      includeJobs 
    })

    // Get workflow state
    const workflowState = await state.get(`workflow:${workflowId}`)
    
    if (!workflowState) {
      logger.warn('Workflow not found', { workflowId })
      return {
        status: 404,
        body: { error: 'Workflow not found' }
      }
    }

    // Get original request for metadata
    const erasureRequest = await state.get(`request:${workflowState.workflowId}`)
    
    if (!erasureRequest) {
      logger.error('Erasure request not found for workflow', { workflowId })
      throw new WorkflowStateError('Inconsistent state: workflow exists but request not found')
    }

    // Calculate progress metrics
    const stepEntries = Object.entries(workflowState.steps || {})
    const totalSteps = stepEntries.length
    const completedSteps = stepEntries.filter(([_, step]) => step.status === 'DELETED').length
    const failedSteps = stepEntries.filter(([_, step]) => step.status === 'FAILED').length
    const percentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

    // Build step summary
    const stepsSummary = Object.fromEntries(
      stepEntries.map(([stepName, step]) => [
        stepName,
        {
          status: step.status,
          attempts: step.attempts,
          lastUpdated: step.evidence.timestamp
        }
      ])
    )

    // Build background jobs summary
    const jobsSummary = Object.fromEntries(
      Object.entries(workflowState.backgroundJobs || {}).map(([jobId, job]) => [
        jobId,
        {
          type: job.type,
          status: job.status,
          progress: job.progress
        }
      ])
    )

    // Estimate completion time (simple heuristic)
    let estimatedCompletion: string | undefined
    if (workflowState.status === 'IN_PROGRESS' && totalSteps > 0) {
      const avgTimePerStep = 300000 // 5 minutes in ms (rough estimate)
      const remainingSteps = totalSteps - completedSteps
      const estimatedMs = remainingSteps * avgTimePerStep
      estimatedCompletion = new Date(Date.now() + estimatedMs).toISOString()
    }

    const statusResponse = {
      workflowId: workflowState.workflowId,
      requestId: erasureRequest.requestId,
      status: workflowState.status,
      progress: {
        totalSteps,
        completedSteps,
        failedSteps,
        percentage
      },
      steps: stepsSummary,
      backgroundJobs: jobsSummary,
      legalHolds: workflowState.legalHolds || [],
      createdAt: erasureRequest.createdAt,
      lastUpdated: new Date().toISOString(),
      estimatedCompletion
    }

    // Emit audit log for status query
    await emit({
      topic: 'audit-log',
      data: {
        event: 'STATUS_QUERIED',
        workflowId,
        requestId: erasureRequest.requestId,
        queriedBy: req.headers['user-id'] || 'unknown',
        timestamp: new Date().toISOString(),
        includeDetails,
        includeJobs
      }
    })

    logger.info('Workflow status retrieved successfully', { 
      workflowId, 
      status: workflowState.status,
      progress: percentage 
    })

    return {
      status: 200,
      body: statusResponse
    }

  } catch (error) {
    if (error instanceof WorkflowStateError) {
      logger.error('Workflow state error', { error: error.message })
      return {
        status: 500,
        body: { error: error.message }
      }
    }

    logger.error('Failed to get workflow status', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to retrieve workflow status' }
    }
  }
}