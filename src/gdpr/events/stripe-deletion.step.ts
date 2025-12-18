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

// Input schema for Stripe deletion event (lenient validation)
const StripeDeletionInputSchema = z.object({
  workflowId: z.string(),
  userIdentifiers: z.object({
    userId: z.string(),
    emails: z.array(z.string()),
    phones: z.array(z.string()),
    aliases: z.array(z.string())
  }),
  stepName: z.string().default('stripe-deletion'),
  attempt: z.number().default(1)
})

export const config = {
  name: 'StripeDeletion',
  type: 'event' as const,
  description: 'Delete customer data from Stripe with retry logic and API response recording',
  flows: ['erasure-workflow'],
  subscribes: ['stripe-deletion'],
  emits: ['step-completed', 'step-failed', 'audit-log', 'database-deletion', 'stripe-deletion'],
  input: StripeDeletionInputSchema
}

export async function handler(data: any, { emit, logger, state }: any): Promise<any> {
  const { workflowId, userIdentifiers, stepName, attempt } = StripeDeletionInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Starting Stripe deletion', { 
    workflowId, 
    userId: userIdentifiers.userId,
    stepName,
    attempt 
  })

  try {
    // Initialize local step tracking (don't depend on shared state)
    const stepState = {
      status: 'IN_PROGRESS',
      attempts: attempt,
      evidence: {
        timestamp,
        receipt: undefined as string | undefined,
        apiResponse: undefined as any
      }
    }

    // Call real Stripe API
    const stripeResult = await performStripeDeletion(userIdentifiers, logger)

    if (stripeResult.success) {
      // Update step state
      stepState.status = 'DELETED'
      stepState.evidence = {
        receipt: stripeResult.receipt,
        timestamp,
        apiResponse: stripeResult.apiResponse
      }

      logger.info('Stripe deletion completed successfully', { 
        workflowId, 
        userId: userIdentifiers.userId,
        receipt: stripeResult.receipt 
      })

      // Emit audit log
      await emit({
        topic: 'audit-log',
        data: {
          event: 'STRIPE_DELETION_COMPLETED',
          workflowId,
          stepName,
          receipt: stripeResult.receipt,
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

      return {
        success: true,
        stepName,
        evidence: stepState.evidence,
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

        logger.warn('Stripe deletion failed, will retry', { 
          workflowId, 
          userId: userIdentifiers.userId,
          attempt,
          nextAttempt,
          retryDelay,
          error: stripeResult.error 
        })

        // Schedule retry via emit (BullMQ handles delay)
        await emit({
          topic: 'stripe-deletion',
          data: {
            workflowId,
            userIdentifiers,
            stepName,
            attempt: nextAttempt
          }
        })

        return {
          success: false,
          stepName,
          shouldRetry: true,
          nextAttempt
        }

      } else {
        logger.error('Stripe deletion failed after max retries', { 
          workflowId, 
          userId: userIdentifiers.userId,
          maxRetries,
          error: stripeResult.error 
        })

        // Emit audit log for failure
        await emit({
          topic: 'audit-log',
          data: {
            event: 'STRIPE_DELETION_FAILED',
            workflowId,
            stepName,
            error: stripeResult.error,
            timestamp
          }
        })

        return {
          success: false,
          stepName,
          error: stripeResult.error,
          shouldRetry: false
        }
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    logger.error('Stripe deletion step failed with exception', { 
      workflowId, 
      userId: userIdentifiers.userId,
      error: errorMessage 
    })

    // Emit audit log for exception
    await emit({
      topic: 'audit-log',
      data: {
        event: 'STRIPE_DELETION_EXCEPTION',
        workflowId,
        stepName,
        error: errorMessage,
        timestamp
      }
    })

    throw error
  }
}

/**
 * Perform actual Stripe deletion using the REAL Stripe SDK
 * Inline implementation to avoid module resolution issues
 */
async function performStripeDeletion(
  userIdentifiers: any, 
  logger: any
): Promise<{
  success: boolean
  receipt?: string
  apiResponse?: any
  error?: string
  deletedResources?: {
    customer: boolean
    subscriptions: number
    paymentMethods: number
    invoices: number
  }
}> {
  try {
    // Import Stripe directly
    const Stripe = (await import('stripe')).default
    
    const apiKey = process.env.STRIPE_SECRET_KEY
    if (!apiKey) {
      return {
        success: false,
        error: 'STRIPE_SECRET_KEY not configured',
        apiResponse: { hint: 'Set STRIPE_SECRET_KEY in .env file' }
      }
    }

    const stripe = new Stripe(apiKey)
    const isTestMode = apiKey.startsWith('sk_test_')
    const timestamp = new Date().toISOString()
    
    logger.info('Calling REAL Stripe API to delete customer', { 
      userId: userIdentifiers.userId,
      emails: userIdentifiers.emails,
      isTestMode
    })

    // Search for customers by email
    const deletedResources = { customer: false, subscriptions: 0, paymentMethods: 0, invoices: 0 }
    const results: any[] = []

    for (const email of userIdentifiers.emails) {
      try {
        const customers = await stripe.customers.search({ query: `email:'${email}'` })
        
        for (const customer of customers.data) {
          // Cancel subscriptions
          const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'active' })
          for (const sub of subs.data) {
            await stripe.subscriptions.cancel(sub.id)
            deletedResources.subscriptions++
          }

          // Detach payment methods
          const pms = await stripe.paymentMethods.list({ customer: customer.id })
          for (const pm of pms.data) {
            await stripe.paymentMethods.detach(pm.id)
            deletedResources.paymentMethods++
          }

          // Delete customer
          const deleted = await stripe.customers.del(customer.id)
          if (deleted.deleted) {
            deletedResources.customer = true
            results.push({ customerId: customer.id, email: customer.email, deleted: true })
          }
        }
      } catch (e: any) {
        logger.warn('Error processing email', { email, error: e.message })
      }
    }

    const receipt = `stripe_del_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`

    logger.info('Stripe API response received', {
      success: true,
      deletedResources,
      isTestMode
    })

    return {
      success: true,
      receipt,
      apiResponse: {
        deletedCustomers: results,
        deletedResources,
        timestamp,
        isTestMode
      },
      deletedResources
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