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
  }
}

// Input schema for Database deletion event
const DatabaseDeletionInputSchema = z.object({
  workflowId: z.string().uuid(),
  userIdentifiers: z.object({
    userId: z.string().min(1, 'User ID is required'),
    emails: z.array(z.string().email()),
    phones: z.array(z.string().regex(/^\+?[\d\s\-\(\)]+$/)),
    aliases: z.array(z.string().min(1, 'Alias cannot be empty'))
  }),
  stepName: z.string().default('database-deletion'),
  attempt: z.number().int().min(1, 'Attempt must be positive').default(1)
})

export const config = {
  name: 'DatabaseDeletion',
  type: 'event' as const,
  description: 'Delete user records from database with transaction hash recording',
  subscribes: ['database-deletion'],
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
      topic: 'checkpoint-validation',
      label: 'Trigger Checkpoint Validation',
      conditional: true
    }
  ],
  input: DatabaseDeletionInputSchema
}

export async function handler(data: any, { emit, logger, state }: any): Promise<void> {
  const { workflowId, userIdentifiers, stepName, attempt } = DatabaseDeletionInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Starting Database deletion', { 
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

    // Verify Stripe deletion completed first (sequential ordering enforcement)
    const stripeStep = workflowState.steps['stripe-deletion']
    if (!stripeStep || stripeStep.status !== 'DELETED') {
      throw new WorkflowStateError(
        workflowId,
        `Database deletion cannot proceed: Stripe deletion not completed. Current status: ${stripeStep?.status || 'NOT_STARTED'}`
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

    // Perform database deletion
    const dbResult = await performDatabaseDeletion(userIdentifiers, logger)

    if (dbResult.success) {
      // Update step to completed
      workflowState.steps[stepName].status = 'DELETED'
      workflowState.steps[stepName].evidence = {
        receipt: dbResult.transactionHash,
        timestamp,
        apiResponse: dbResult.dbResponse
      }

      // Save updated state
      await state.set(`workflow:${workflowId}`, workflowState)

      logger.info('Database deletion completed successfully', { 
        workflowId, 
        userId: userIdentifiers.userId,
        transactionHash: dbResult.transactionHash 
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
          event: 'DATABASE_DELETION_COMPLETED',
          workflowId,
          stepName,
          userIdentifiers,
          evidence: workflowState.steps[stepName].evidence,
          timestamp
        }
      })

      // Trigger checkpoint validation (both identity-critical steps completed)
      await emit({
        topic: 'checkpoint-validation',
        data: {
          workflowId,
          checkpointType: 'identity-critical',
          requiredSteps: ['stripe-deletion', 'database-deletion']
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

        logger.warn('Database deletion failed, will retry', { 
          workflowId, 
          userId: userIdentifiers.userId,
          attempt,
          nextAttempt,
          retryDelay,
          error: dbResult.error 
        })

        // Update step with failure but keep in progress for retry
        workflowState.steps[stepName].evidence = {
          timestamp,
          apiResponse: dbResult.dbResponse
        }
        await state.set(`workflow:${workflowId}`, workflowState)

        // Schedule retry
        setTimeout(async () => {
          await emit({
            topic: 'database-deletion',
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
          apiResponse: dbResult.dbResponse
        }
        await state.set(`workflow:${workflowId}`, workflowState)

        logger.error('Database deletion failed after max retries', { 
          workflowId, 
          userId: userIdentifiers.userId,
          maxRetries,
          error: dbResult.error 
        })

        // Emit step failure
        await emit({
          topic: 'step-failed',
          data: {
            workflowId,
            stepName,
            status: 'FAILED',
            error: dbResult.error,
            evidence: workflowState.steps[stepName].evidence,
            timestamp,
            requiresManualIntervention: true
          }
        })

        // Emit audit log
        await emit({
          topic: 'audit-log',
          data: {
            event: 'DATABASE_DELETION_FAILED',
            workflowId,
            stepName,
            userIdentifiers,
            error: dbResult.error,
            evidence: workflowState.steps[stepName].evidence,
            timestamp,
            requiresManualIntervention: true
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
    logger.error('Database deletion step failed with exception', { 
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
        requiresManualIntervention: true
      }
    })

    throw error
  }
}

/**
 * Perform actual database deletion (mock implementation for now)
 * In production, this would execute database transactions
 */
async function performDatabaseDeletion(
  userIdentifiers: any, 
  logger: any
): Promise<{
  success: boolean
  transactionHash?: string
  dbResponse?: any
  error?: string
}> {
  try {
    logger.info('Executing database deletion transaction', { 
      userId: userIdentifiers.userId,
      emails: userIdentifiers.emails 
    })

    // Simulate database transaction delay
    await new Promise(resolve => setTimeout(resolve, 150))

    // Mock successful response (95% success rate for testing)
    const isSuccess = Math.random() > 0.05

    if (isSuccess) {
      // Generate mock transaction hash
      const transactionHash = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      return {
        success: true,
        transactionHash,
        dbResponse: {
          deletedRecords: {
            users: 1,
            user_profiles: 1,
            user_preferences: 1,
            user_sessions: 3
          },
          transactionId: transactionHash,
          timestamp: new Date().toISOString(),
          affectedTables: ['users', 'user_profiles', 'user_preferences', 'user_sessions']
        }
      }
    } else {
      return {
        success: false,
        error: 'Database transaction failed: Foreign key constraint violation',
        dbResponse: {
          error: {
            code: 'FOREIGN_KEY_VIOLATION',
            message: 'Cannot delete user record due to existing references',
            constraint: 'fk_user_orders'
          }
        }
      }
    }

  } catch (error) {
    logger.error('Database transaction failed', { error: error.message })
    return {
      success: false,
      error: `Database exception: ${error.message}`,
      dbResponse: { exception: error.message }
    }
  }
}