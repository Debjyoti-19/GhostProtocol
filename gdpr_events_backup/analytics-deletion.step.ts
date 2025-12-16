import { z } from 'zod'

// Simple error classes for this step
class WorkflowStateError extends Error {
  constructor(workflowId: string, message: string) {
    super(`Workflow ${workflowId}: ${message}`)
    this.name = 'WorkflowStateError'
  }
}

// Configuration constants (inline to avoid import issues)
const ghostProtocolConfig = {
  externalSystems: {
    analytics: {
      timeout: 25000,
      maxRetries: 3
    }
  }
}

// Input schema for Analytics deletion event
const AnalyticsDeletionInputSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  userIdentifiers: z.object({
    userId: z.string().min(1, 'User ID is required'),
    emails: z.array(z.string().email('Invalid email format')),
    phones: z.array(z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone format')),
    aliases: z.array(z.string().min(1, 'Alias cannot be empty'))
  }),
  stepName: z.string().default('analytics-deletion'),
  attempt: z.number().int().min(1, 'Attempt must be positive').default(1)
})

// Response schema for Analytics deletion
const AnalyticsDeletionResponseSchema = z.object({
  success: z.boolean(),
  stepName: z.string(),
  evidence: z.object({
    receipt: z.string().optional(),
    timestamp: z.string().datetime(),
    apiResponse: z.any().optional()
  }),
  shouldRetry: z.boolean().default(false),
  nextAttempt: z.number().int().optional()
})

export const config: EventRouteConfig = {
  name: 'AnalyticsDeletion',
  type: 'event',
  topic: 'analytics-deletion',
  description: 'Delete tracking data from analytics systems with retry logic',
  emits: [
    {
      topic: 'step-completed',
      label: 'Step Completed',
      conditional: false
    },
    {
      topic: 'step-failed',
      label: 'Step Failed',
      conditional: true
    },
    {
      topic: 'audit-log',
      label: 'Audit Log Entry',
      conditional: false
    },
    {
      topic: 'parallel-step-completed',
      label: 'Parallel Step Completed',
      conditional: true
    }
  ],
  flows: ['erasure-workflow'],
  inputSchema: AnalyticsDeletionInputSchema,
  outputSchema: AnalyticsDeletionResponseSchema
}

export const handler: Handlers['AnalyticsDeletion'] = async (data, { emit, logger, state }) => {
  const { workflowId, userIdentifiers, stepName, attempt } = AnalyticsDeletionInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Starting Analytics deletion', { 
    workflowId, 
    userId: userIdentifiers.userId,
    stepName,
    attempt 
  })

  try {
    // Get current workflow state
    const workflowState = await state.get(`workflow:${workflowId}`)
    if (!workflowState) {
      throw new WorkflowStateError(workflowId, `Workflow not found`)
    }

    // Verify identity-critical checkpoint is completed (parallel step dependency)
    if (!workflowState.identityCriticalCompleted) {
      throw new WorkflowStateError(
        workflowId,
        `Analytics deletion cannot proceed: Identity-critical checkpoint not completed`
      )
    }

    // Initialize step state if not exists
    if (!workflowState.steps[stepName]) {
      workflowState.steps[stepName] = {
        status: 'NOT_STARTED',
        attempts: 0,
        evidence: {
          timestamp,
          receipt: undefined,
          apiResponse: undefined
        }
      }
    }

    // Update step to in progress
    workflowState.steps[stepName].status = 'IN_PROGRESS'
    workflowState.steps[stepName].attempts = attempt

    // Save updated state
    await state.set(`workflow:${workflowId}`, workflowState)

    // Perform Analytics deletion
    const analyticsResult = await performAnalyticsDeletion(userIdentifiers, logger)

    if (analyticsResult.success) {
      // Update step to completed
      workflowState.steps[stepName].status = 'DELETED'
      workflowState.steps[stepName].evidence = {
        receipt: analyticsResult.receipt,
        timestamp,
        apiResponse: analyticsResult.apiResponse
      }

      // Save updated state
      await state.set(`workflow:${workflowId}`, workflowState)

      logger.info('Analytics deletion completed successfully', { 
        workflowId, 
        userId: userIdentifiers.userId,
        receipt: analyticsResult.receipt 
      })

      // Emit step completion
      await emit({
        topic: 'step-completed',
        data: {
          workflowId,
          stepName,
          status: 'DELETED',
          evidence: workflowState.steps[stepName].evidence,
          timestamp
        }
      })

      // Emit audit log
      await emit({
        topic: 'audit-log',
        data: {
          event: 'ANALYTICS_DELETION_COMPLETED',
          workflowId,
          stepName,
          userIdentifiers,
          evidence: workflowState.steps[stepName].evidence,
          timestamp
        }
      })

      // Emit parallel step completion for checkpoint tracking
      await emit({
        topic: 'parallel-step-completed',
        data: {
          workflowId,
          stepName,
          stepType: 'parallel-deletion',
          timestamp
        }
      })

      return {
        success: true,
        stepName,
        evidence: workflowState.steps[stepName].evidence,
        shouldRetry: false
      }

    } else {
      // Handle failure with retry logic
      const maxRetries = ghostProtocolConfig.workflow.maxRetryAttempts
      const shouldRetry = attempt < maxRetries

      if (shouldRetry) {
        const nextAttempt = attempt + 1
        const retryDelay = ghostProtocolConfig.workflow.initialRetryDelay * 
          Math.pow(ghostProtocolConfig.workflow.retryBackoffMultiplier, attempt - 1)

        logger.warn('Analytics deletion failed, will retry', { 
          workflowId, 
          userId: userIdentifiers.userId,
          attempt,
          nextAttempt,
          retryDelay,
          error: analyticsResult.error 
        })

        // Update step with failure but keep in progress for retry
        workflowState.steps[stepName].evidence = {
          timestamp,
          apiResponse: analyticsResult.apiResponse
        }
        await state.set(`workflow:${workflowId}`, workflowState)

        // Schedule retry with exponential backoff
        setTimeout(async () => {
          await emit({
            topic: 'analytics-deletion',
            data: {
              workflowId,
              userIdentifiers,
              stepName,
              attempt: nextAttempt
            }
          })
        }, retryDelay)

        return {
          success: false,
          stepName,
          evidence: workflowState.steps[stepName].evidence,
          shouldRetry: true,
          nextAttempt
        }

      } else {
        // Max retries exceeded, mark as failed
        workflowState.steps[stepName].status = 'FAILED'
        workflowState.steps[stepName].evidence = {
          timestamp,
          apiResponse: analyticsResult.apiResponse
        }
        await state.set(`workflow:${workflowId}`, workflowState)

        logger.error('Analytics deletion failed after max retries', { 
          workflowId, 
          userId: userIdentifiers.userId,
          maxRetries,
          error: analyticsResult.error 
        })

        // Emit step failure
        await emit({
          topic: 'step-failed',
          data: {
            workflowId,
            stepName,
            status: 'FAILED',
            error: analyticsResult.error,
            evidence: workflowState.steps[stepName].evidence,
            timestamp,
            requiresManualIntervention: false // Non-critical system
          }
        })

        // Emit audit log
        await emit({
          topic: 'audit-log',
          data: {
            event: 'ANALYTICS_DELETION_FAILED',
            workflowId,
            stepName,
            userIdentifiers,
            error: analyticsResult.error,
            evidence: workflowState.steps[stepName].evidence,
            timestamp,
            requiresManualIntervention: false
          }
        })

        // Still emit parallel step completion (with failure status) for checkpoint tracking
        await emit({
          topic: 'parallel-step-completed',
          data: {
            workflowId,
            stepName,
            stepType: 'parallel-deletion',
            status: 'FAILED',
            timestamp
          }
        })

        return {
          success: false,
          stepName,
          evidence: workflowState.steps[stepName].evidence,
          shouldRetry: false
        }
      }
    }

  } catch (error) {
    logger.error('Analytics deletion step failed with exception', { 
      workflowId, 
      userId: userIdentifiers.userId,
      error: error.message 
    })

    // Emit step failure
    await emit({
      topic: 'step-failed',
      data: {
        workflowId,
        stepName,
        status: 'FAILED',
        error: error.message,
        timestamp,
        requiresManualIntervention: false
      }
    })

    throw error
  }
}

/**
 * Perform actual Analytics deletion (mock implementation for now)
 * In production, this would integrate with analytics APIs (Google Analytics, Mixpanel, etc.)
 */
async function performAnalyticsDeletion(
  userIdentifiers: any, 
  logger: any
): Promise<{
  success: boolean
  receipt?: string
  apiResponse?: any
  error?: string
}> {
  try {
    logger.info('Calling Analytics APIs to delete tracking data', { 
      userId: userIdentifiers.userId,
      emails: userIdentifiers.emails 
    })

    // Simulate API call delay (analytics systems can be slower)
    await new Promise(resolve => setTimeout(resolve, 400))

    // Mock successful response (75% success rate for testing - analytics can be flaky)
    const isSuccess = Math.random() > 0.25

    if (isSuccess) {
      const receipt = `analytics_del_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`
      return {
        success: true,
        receipt,
        apiResponse: {
          user_id: userIdentifiers.userId,
          deleted_events: Math.floor(Math.random() * 1000) + 100,
          deleted_sessions: Math.floor(Math.random() * 50) + 10,
          deleted_user_properties: Math.floor(Math.random() * 20) + 5,
          purged_from_cohorts: Math.floor(Math.random() * 3),
          systems_processed: ['google_analytics', 'mixpanel', 'amplitude'],
          timestamp: new Date().toISOString()
        }
      }
    } else {
      return {
        success: false,
        error: 'Analytics API returned error: Data retention policy conflict',
        apiResponse: {
          error: {
            type: 'policy_violation',
            message: 'User data is within legal retention period',
            code: 'retention_policy_active'
          }
        }
      }
    }

  } catch (error) {
    logger.error('Analytics API call failed', { error: error.message })
    return {
      success: false,
      error: `Analytics API exception: ${error.message}`,
      apiResponse: { exception: error.message }
    }
  }
}