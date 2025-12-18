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
    crm: {
      timeout: 20000,
      maxRetries: 3
    }
  }
}

// Input schema for CRM deletion event
const CRMDeletionInputSchema = z.object({
  workflowId: z.string().uuid(),
  userIdentifiers: z.object({
    userId: z.string().min(1, 'User ID is required'),
    emails: z.array(z.string().email()),
    phones: z.array(z.string().regex(/^\+?[\d\s\-\(\)]+$/)),
    aliases: z.array(z.string().min(1, 'Alias cannot be empty'))
  }),
  stepName: z.string().default('crm-deletion'),
  attempt: z.number().int().min(1, 'Attempt must be positive').default(1)
})

export const config = {
  name: 'CRMDeletion',
  type: 'event' as const,
  description: 'Delete customer records from CRM system with retry logic',
  subscribes: ['crm-deletion'],
  emits: [
    {
      topic: 'step-completed',
      label: 'Step Completed'
    },
    {
      topic: 'step-failed',
      label: 'Step Failed',
      conditional: true
    },
    {
      topic: 'audit-log',
      label: 'Audit Log Entry'
    },
    {
      topic: 'parallel-step-completed',
      label: 'Parallel Step Completed',
      conditional: true
    }
  ],
  input: CRMDeletionInputSchema
}

export async function handler(data: any, { emit, logger, state }: any): Promise<void> {
  const { workflowId, userIdentifiers, stepName, attempt } = CRMDeletionInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Starting CRM deletion', { 
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
        `CRM deletion cannot proceed: Identity-critical checkpoint not completed`
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

    // Perform CRM deletion
    const crmResult = await performCRMDeletion(userIdentifiers, logger)

    if (crmResult.success) {
      // Update step to completed
      workflowState.steps[stepName].status = 'DELETED'
      workflowState.steps[stepName].evidence = {
        receipt: crmResult.receipt,
        timestamp,
        apiResponse: crmResult.apiResponse
      }

      // Save updated state
      await state.set(`workflow:${workflowId}`, workflowState)

      logger.info('CRM deletion completed successfully', { 
        workflowId, 
        userId: userIdentifiers.userId,
        receipt: crmResult.receipt 
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
          event: 'CRM_DELETION_COMPLETED',
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

        logger.warn('CRM deletion failed, will retry', { 
          workflowId, 
          userId: userIdentifiers.userId,
          attempt,
          nextAttempt,
          retryDelay,
          error: crmResult.error 
        })

        // Update step with failure but keep in progress for retry
        workflowState.steps[stepName].evidence = {
          timestamp,
          apiResponse: crmResult.apiResponse
        }
        await state.set(`workflow:${workflowId}`, workflowState)

        // Schedule retry with exponential backoff
        setTimeout(async () => {
          await emit({
            topic: 'crm-deletion',
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
          apiResponse: crmResult.apiResponse
        }
        await state.set(`workflow:${workflowId}`, workflowState)

        logger.error('CRM deletion failed after max retries', { 
          workflowId, 
          userId: userIdentifiers.userId,
          maxRetries,
          error: crmResult.error 
        })

        // Emit step failure
        await emit({
          topic: 'step-failed',
          data: {
            workflowId,
            stepName,
            status: 'FAILED',
            error: crmResult.error,
            evidence: workflowState.steps[stepName].evidence,
            timestamp,
            requiresManualIntervention: false // Non-critical system
          }
        })

        // Emit audit log
        await emit({
          topic: 'audit-log',
          data: {
            event: 'CRM_DELETION_FAILED',
            workflowId,
            stepName,
            userIdentifiers,
            error: crmResult.error,
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
    logger.error('CRM deletion step failed with exception', { 
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
 * Perform actual CRM deletion using the CRM connector
 */
async function performCRMDeletion(
  userIdentifiers: any, 
  logger: any
): Promise<{
  success: boolean
  receipt?: string
  apiResponse?: any
  error?: string
}> {
  try {
    // Use the CRM connector
    const { crmConnector } = await import('../integrations/index.js')
    
    logger.info('Calling CRM API to delete customer records', { 
      userId: userIdentifiers.userId,
      emails: userIdentifiers.emails 
    })

    // Call the connector
    const result = await crmConnector.deleteCustomer(userIdentifiers)

    return result

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('CRM API call failed', { error: errorMessage })
    return {
      success: false,
      error: `CRM API exception: ${errorMessage}`,
      apiResponse: { exception: errorMessage }
    }
  }
}