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

// Input schema for Stripe deletion event
const StripeDeletionInputSchema = z.object({
  workflowId: z.string().uuid(),
  userIdentifiers: z.object({
    userId: z.string().min(1, 'User ID is required'),
    emails: z.array(z.string().email()),
    phones: z.array(z.string().regex(/^\+?[\d\s\-\(\)]+$/)),
    aliases: z.array(z.string().min(1, 'Alias cannot be empty'))
  }),
  stepName: z.string().default('stripe-deletion'),
  attempt: z.number().int().min(1, 'Attempt must be positive').default(1)
})

export const config = {
  name: 'StripeDeletion',
  type: 'event' as const,
  description: 'Delete customer data from Stripe with retry logic and API response recording',
  subscribes: ['stripe-deletion'],
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
      topic: 'database-deletion',
      label: 'Trigger Database Deletion'
    }
  ],
  input: StripeDeletionInputSchema
}

export async function handler(data: any, { emit, logger, state }: any): Promise<void> {
  const { workflowId, userIdentifiers, stepName, attempt } = StripeDeletionInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Starting Stripe deletion', { 
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

    // Simulate Stripe API call (in real implementation, this would call actual Stripe API)
    const stripeResult = await performStripeDeletion(userIdentifiers, logger)

    if (stripeResult.success) {
      // Update step to completed
      workflowState.steps[stepName].status = 'DELETED'
      workflowState.steps[stepName].evidence = {
        receipt: stripeResult.receipt,
        timestamp,
        apiResponse: stripeResult.apiResponse
      }

      // Save updated state
      await state.set(`workflow:${workflowId}`, workflowState)

      logger.info('Stripe deletion completed successfully', { 
        workflowId, 
        userId: userIdentifiers.userId,
        receipt: stripeResult.receipt 
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
          event: 'STRIPE_DELETION_COMPLETED',
          workflowId,
          stepName,
          userIdentifiers,
          evidence: workflowState.steps[stepName].evidence,
          timestamp
        }
      })

      // Trigger database deletion (sequential ordering)
      await emit({
        topic: 'database-deletion',
        data: {
          workflowId,
          userIdentifiers,
          stepName: 'database-deletion',
          attempt: 1
        }
      })

      // Event step completed successfully

    } else {
      // Handle failure with retry logic
      const maxRetries = ghostProtocolConfig.workflow.maxRetryAttempts
      const shouldRetry = attempt < maxRetries

      if (shouldRetry) {
        const nextAttempt = attempt + 1
        const retryDelay = ghostProtocolConfig.workflow.initialRetryDelay * 
          Math.pow(ghostProtocolConfig.workflow.retryBackoffMultiplier, attempt - 1)

        logger.warn('Stripe deletion failed, will retry', { 
          workflowId, 
          userId: userIdentifiers.userId,
          attempt,
          nextAttempt,
          retryDelay,
          error: stripeResult.error 
        })

        // Update step with failure but keep in progress for retry
        workflowState.steps[stepName].evidence = {
          timestamp,
          apiResponse: stripeResult.apiResponse
        }
        await state.set(`workflow:${workflowId}`, workflowState)

        // Schedule retry
        setTimeout(async () => {
          await emit({
            topic: 'stripe-deletion',
            data: {
              workflowId,
              userIdentifiers,
              stepName,
              attempt: nextAttempt
            }
          })
        }, retryDelay)

        // Retry scheduled

      } else {
        // Max retries exceeded, mark as failed
        workflowState.steps[stepName].status = 'FAILED'
        workflowState.steps[stepName].evidence = {
          timestamp,
          apiResponse: stripeResult.apiResponse
        }
        await state.set(`workflow:${workflowId}`, workflowState)

        logger.error('Stripe deletion failed after max retries', { 
          workflowId, 
          userId: userIdentifiers.userId,
          maxRetries,
          error: stripeResult.error 
        })

        // Emit step failure
        await emit({
          topic: 'step-failed',
          data: {
            workflowId,
            stepName,
            status: 'FAILED',
            error: stripeResult.error,
            evidence: workflowState.steps[stepName].evidence,
            timestamp,
            requiresManualIntervention: true
          }
        })

        // Emit audit log
        await emit({
          topic: 'audit-log',
          data: {
            event: 'STRIPE_DELETION_FAILED',
            workflowId,
            stepName,
            userIdentifiers,
            error: stripeResult.error,
            evidence: workflowState.steps[stepName].evidence,
            timestamp,
            requiresManualIntervention: true
          }
        })

        // Max retries exceeded, step failed
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    logger.error('Stripe deletion step failed with exception', { 
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
        requiresManualIntervention: true
      }
    })

    throw error
  }
}

/**
 * Perform actual Stripe deletion (mock implementation for now)
 * In production, this would integrate with the real Stripe API
 */
async function performStripeDeletion(
  userIdentifiers: any, 
  logger: any
): Promise<{
  success: boolean
  receipt?: string
  apiResponse?: any
  error?: string
}> {
  try {
    // Mock Stripe API call
    // In real implementation: const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    
    logger.info('Calling Stripe API to delete customer', { 
      userId: userIdentifiers.userId,
      emails: userIdentifiers.emails 
    })

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100))

    // Mock successful response (90% success rate for testing)
    const isSuccess = Math.random() > 0.1

    if (isSuccess) {
      const receipt = `stripe_del_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`
      return {
        success: true,
        receipt,
        apiResponse: {
          id: userIdentifiers.userId,
          object: 'customer',
          deleted: true,
          timestamp: new Date().toISOString()
        }
      }
    } else {
      return {
        success: false,
        error: 'Stripe API returned error: Customer deletion failed',
        apiResponse: {
          error: {
            type: 'api_error',
            message: 'Customer deletion failed',
            code: 'customer_deletion_error'
          }
        }
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Stripe API call failed', { error: errorMessage })
    return {
      success: false,
      error: `Stripe API exception: ${errorMessage}`,
      apiResponse: { exception: errorMessage }
    }
  }
}