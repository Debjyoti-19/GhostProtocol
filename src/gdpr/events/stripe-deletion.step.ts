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
        // Try search API first
        logger.info('Searching for Stripe customer', { email })
        const customers = await stripe.customers.search({ query: `email:'${email}'` })
        
        logger.info('Stripe search results', { email, count: customers.data.length })

        if (customers.data.length === 0) {
          // Fallback: list all customers and filter (for recently created customers)
          logger.info('No results from search, trying list API', { email })
          const allCustomers = await stripe.customers.list({ email, limit: 10 })
          customers.data.push(...allCustomers.data)
          logger.info('List API results', { email, count: allCustomers.data.length })
        }
        
        for (const customer of customers.data) {
          logger.info('Processing customer for deletion', { customerId: customer.id, email: customer.email })

          // Cancel subscriptions
          try {
            const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'active' })
            for (const sub of subs.data) {
              await stripe.subscriptions.cancel(sub.id)
              deletedResources.subscriptions++
              logger.info('Cancelled subscription', { subId: sub.id })
            }
          } catch (subErr: any) {
            logger.warn('Error cancelling subscriptions', { error: subErr.message })
          }

          // Detach payment methods
          try {
            const pms = await stripe.paymentMethods.list({ customer: customer.id })
            for (const pm of pms.data) {
              await stripe.paymentMethods.detach(pm.id)
              deletedResources.paymentMethods++
              logger.info('Detached payment method', { pmId: pm.id })
            }
          } catch (pmErr: any) {
            logger.warn('Error detaching payment methods', { error: pmErr.message })
          }

          // Delete customer
          try {
            const deleted = await stripe.customers.del(customer.id)
            if (deleted.deleted) {
              deletedResources.customer = true
              results.push({ customerId: customer.id, email: customer.email, deleted: true })
              logger.info('Deleted Stripe customer', { customerId: customer.id })
            }
          } catch (delErr: any) {
            logger.warn('Error deleting customer', { customerId: customer.id, error: delErr.message })
          }
        }
      } catch (e: any) {
        logger.warn('Error processing email', { email, error: e.message })
      }
    }

    const receipt = `stripe_del_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`

    // CRITICAL: Forward-only saga - must verify deletion actually happened
    // If no customer was found/deleted, this is a FAILURE (data might still exist)
    const actuallyDeleted = deletedResources.customer || results.length > 0

    logger.info('Stripe API response received', {
      success: actuallyDeleted,
      deletedResources,
      customersFound: results.length,
      isTestMode
    })

    if (!actuallyDeleted) {
      // No customer found - could be:
      // 1. Customer doesn't exist (OK for GDPR - nothing to delete)
      // 2. Search API indexing delay (NOT OK - retry needed)
      // We treat "no customer found" as success only if we're confident they don't exist
      // For safety in forward-only saga, we should retry to be sure
      logger.warn('No Stripe customer found to delete - may need retry', {
        emails: userIdentifiers.emails,
        searchResults: results.length
      })
      
      return {
        success: false,
        error: 'No Stripe customer found - search may have indexing delay',
        apiResponse: {
          deletedCustomers: results,
          deletedResources,
          timestamp,
          isTestMode,
          hint: 'Stripe search API has indexing delay for new customers'
        }
      }
    }

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