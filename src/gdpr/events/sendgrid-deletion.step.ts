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
  workflow: {
    maxRetryAttempts: 3,
    initialRetryDelay: 1000,
    retryBackoffMultiplier: 2
  },
  externalSystems: {
    sendgrid: {
      timeout: 10000,
      maxRetries: 3
    }
  }
}

// Input schema for SendGrid deletion event
const SendGridDeletionInputSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  userIdentifiers: z.object({
    userId: z.string().min(1, 'User ID is required'),
    emails: z.array(z.string().email('Invalid email format')),
    phones: z.array(z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone format')),
    aliases: z.array(z.string().min(1, 'Alias cannot be empty'))
  }),
  stepName: z.string().default('sendgrid-deletion'),
  attempt: z.number().int().min(1, 'Attempt must be positive').default(1)
})

// Response schema for SendGrid deletion
const SendGridDeletionResponseSchema = z.object({
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

export const config = {
  name: 'SendGridDeletion',
  type: 'event' as const,
  description: 'Delete email lists and templates from SendGrid with retry logic',
  flows: ['erasure-workflow'],
  subscribes: ['sendgrid-deletion'],
  emits: [
    {
      topic: 'step-completed',
      label: 'Step Completed'
    },
    {
      topic: 'step-failed',
      label: 'Step Failed'
    },
    {
      topic: 'audit-log',
      label: 'Audit Log Entry'
    },
    {
      topic: 'parallel-step-completed',
      label: 'Parallel Step Completed'
    }
  ],
  input: SendGridDeletionInputSchema
}

export async function handler(data: any, { emit, logger, state }: any): Promise<any> {
  const { workflowId, userIdentifiers, stepName, attempt } = SendGridDeletionInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Starting SendGrid deletion', { 
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
        `SendGrid deletion cannot proceed: Identity-critical checkpoint not completed`
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

    // Perform SendGrid deletion
    const sendgridResult = await performSendGridDeletion(userIdentifiers, logger)

    if (sendgridResult.success) {
      // Update step to completed
      workflowState.steps[stepName].status = 'DELETED'
      workflowState.steps[stepName].evidence = {
        receipt: sendgridResult.receipt,
        timestamp,
        apiResponse: sendgridResult.apiResponse
      }

      // Save updated state
      await state.set(`workflow:${workflowId}`, workflowState)

      logger.info('SendGrid deletion completed successfully', { 
        workflowId, 
        userId: userIdentifiers.userId,
        receipt: sendgridResult.receipt 
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
          event: 'SENDGRID_DELETION_COMPLETED',
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

        logger.warn('SendGrid deletion failed, will retry', { 
          workflowId, 
          userId: userIdentifiers.userId,
          attempt,
          nextAttempt,
          retryDelay,
          error: sendgridResult.error 
        })

        // Update step with failure but keep in progress for retry
        workflowState.steps[stepName].evidence = {
          timestamp,
          apiResponse: sendgridResult.apiResponse
        }
        await state.set(`workflow:${workflowId}`, workflowState)

        // Schedule retry with exponential backoff
        setTimeout(async () => {
          await emit({
            topic: 'sendgrid-deletion',
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
          apiResponse: sendgridResult.apiResponse
        }
        await state.set(`workflow:${workflowId}`, workflowState)

        logger.error('SendGrid deletion failed after max retries', { 
          workflowId, 
          userId: userIdentifiers.userId,
          maxRetries,
          error: sendgridResult.error 
        })

        // Emit step failure
        await emit({
          topic: 'step-failed',
          data: {
            workflowId,
            stepName,
            status: 'FAILED',
            error: sendgridResult.error,
            evidence: workflowState.steps[stepName].evidence,
            timestamp,
            requiresManualIntervention: false // Non-critical system
          }
        })

        // Emit audit log
        await emit({
          topic: 'audit-log',
          data: {
            event: 'SENDGRID_DELETION_FAILED',
            workflowId,
            stepName,
            userIdentifiers,
            error: sendgridResult.error,
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    logger.error('SendGrid deletion step failed with exception', { 
      workflowId, 
      userId: userIdentifiers.userId,
      error: errorMessage 
    })

    // Emit step failure
    await emit({
      topic: 'step-failed',
      data: {
        workflowId,
        stepName,
        status: 'FAILED',
        error: errorMessage,
        timestamp,
        requiresManualIntervention: false
      }
    })

    throw error
  }
}

/**
 * Perform actual SendGrid deletion using the SendGrid connector
 */
async function performSendGridDeletion(
  userIdentifiers: any, 
  logger: any
): Promise<{
  success: boolean
  receipt?: string
  apiResponse?: any
  error?: string
}> {
  try {
    // Use the SendGrid connector
    const { sendGridConnector } = await import('../integrations/index.js')
    
    logger.info('Calling SendGrid API to delete email lists and templates', { 
      userId: userIdentifiers.userId,
      emails: userIdentifiers.emails 
    })

    // Call the connector
    const result = await sendGridConnector.deleteContacts(userIdentifiers)

    return result

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('SendGrid API call failed', { error: errorMessage })
    return {
      success: false,
      error: `SendGrid API exception: ${errorMessage}`,
      apiResponse: { exception: errorMessage }
    }
  }
}