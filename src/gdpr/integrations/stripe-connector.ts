/**
 * Stripe Integration Connector
 * REAL implementation using official Stripe SDK
 * 
 * Setup:
 * 1. Get your API key from https://dashboard.stripe.com/apikeys
 * 2. Set STRIPE_SECRET_KEY environment variable (use test key for development)
 * 3. Test keys start with 'sk_test_', live keys start with 'sk_live_'
 */

import Stripe from 'stripe'

export interface StripeCustomer {
  id: string
  email: string | null
  deleted: boolean
  timestamp: string
}

export interface StripeDeletionResult {
  success: boolean
  receipt?: string
  customerId?: string
  apiResponse?: any
  error?: string
  deletedResources?: {
    customer: boolean
    subscriptions: number
    paymentMethods: number
    invoices: number
  }
}

export interface StripeCustomerSearchResult {
  found: boolean
  customers: Array<{
    id: string
    email: string | null
    name: string | null
    created: number
  }>
}

export class StripeConnector {
  private stripe: Stripe
  private isTestMode: boolean

  constructor(apiKey?: string) {
    const key = apiKey || process.env.STRIPE_SECRET_KEY
    
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required')
    }

    this.stripe = new Stripe(key, {
      apiVersion: '2025-04-30.basil'
    })
    
    this.isTestMode = key.startsWith('sk_test_')
  }

  /**
   * Search for customers by email
   */
  async searchCustomersByEmail(email: string): Promise<StripeCustomerSearchResult> {
    try {
      const customers = await this.stripe.customers.search({
        query: `email:'${email}'`,
        limit: 10
      })

      return {
        found: customers.data.length > 0,
        customers: customers.data.map(c => ({
          id: c.id,
          email: c.email,
          name: c.name,
          created: c.created
        }))
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Stripe customer search failed:', errorMessage)
      return { found: false, customers: [] }
    }
  }

  /**
   * Search for customers by multiple emails
   */
  async findCustomersByEmails(emails: string[]): Promise<StripeCustomerSearchResult> {
    const allCustomers: StripeCustomerSearchResult['customers'] = []
    
    for (const email of emails) {
      const result = await this.searchCustomersByEmail(email)
      if (result.found) {
        allCustomers.push(...result.customers)
      }
    }

    // Deduplicate by customer ID
    const uniqueCustomers = Array.from(
      new Map(allCustomers.map(c => [c.id, c])).values()
    )

    return {
      found: uniqueCustomers.length > 0,
      customers: uniqueCustomers
    }
  }

  /**
   * Delete a customer from Stripe (REAL API CALL)
   * This permanently deletes the customer and all associated data
   */
  async deleteCustomer(userId: string, emails: string[]): Promise<StripeDeletionResult> {
    const timestamp = new Date().toISOString()
    const deletedResources = {
      customer: false,
      subscriptions: 0,
      paymentMethods: 0,
      invoices: 0
    }

    try {
      // Step 1: Find customers by email
      const searchResult = await this.findCustomersByEmails(emails)
      
      if (!searchResult.found || searchResult.customers.length === 0) {
        // No customer found - this is actually a success for GDPR (no data to delete)
        return {
          success: true,
          receipt: `stripe_no_data_${Date.now()}_${userId.slice(0, 8)}`,
          apiResponse: {
            message: 'No Stripe customer found for provided emails',
            emails,
            searchedAt: timestamp,
            isTestMode: this.isTestMode
          },
          deletedResources
        }
      }

      const results: any[] = []

      // Step 2: Delete each found customer
      for (const customer of searchResult.customers) {
        try {
          // Cancel all active subscriptions first
          const subscriptions = await this.stripe.subscriptions.list({
            customer: customer.id,
            status: 'active'
          })

          for (const sub of subscriptions.data) {
            await this.stripe.subscriptions.cancel(sub.id)
            deletedResources.subscriptions++
          }

          // Delete payment methods
          const paymentMethods = await this.stripe.paymentMethods.list({
            customer: customer.id
          })

          for (const pm of paymentMethods.data) {
            await this.stripe.paymentMethods.detach(pm.id)
            deletedResources.paymentMethods++
          }

          // Delete the customer (this also deletes associated data)
          const deletedCustomer = await this.stripe.customers.del(customer.id)
          
          if (deletedCustomer.deleted) {
            deletedResources.customer = true
            results.push({
              customerId: customer.id,
              email: customer.email,
              deleted: true,
              deletedAt: timestamp
            })
          }

        } catch (customerError) {
          const errorMsg = customerError instanceof Error ? customerError.message : 'Unknown error'
          results.push({
            customerId: customer.id,
            email: customer.email,
            deleted: false,
            error: errorMsg
          })
        }
      }

      // Check if all deletions succeeded
      const allDeleted = results.every(r => r.deleted)
      const receipt = `stripe_del_${Date.now()}_${userId.slice(0, 8)}`

      return {
        success: allDeleted,
        receipt,
        customerId: searchResult.customers[0]?.id,
        apiResponse: {
          deletedCustomers: results,
          totalCustomersFound: searchResult.customers.length,
          totalDeleted: results.filter(r => r.deleted).length,
          deletedResources,
          timestamp,
          isTestMode: this.isTestMode
        },
        deletedResources,
        error: allDeleted ? undefined : 'Some customers could not be deleted'
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const stripeError = error as Stripe.errors.StripeError
      
      return {
        success: false,
        error: `Stripe API error: ${errorMessage}`,
        apiResponse: {
          exception: errorMessage,
          type: stripeError?.type,
          code: stripeError?.code,
          timestamp,
          isTestMode: this.isTestMode
        },
        deletedResources
      }
    }
  }

  /**
   * Cancel all subscriptions for a customer
   */
  async cancelSubscriptions(customerId: string): Promise<{ success: boolean; canceledCount: number; details: any[] }> {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'active'
      })

      const results: any[] = []

      for (const sub of subscriptions.data) {
        const canceled = await this.stripe.subscriptions.cancel(sub.id)
        results.push({
          subscriptionId: sub.id,
          status: canceled.status,
          canceledAt: canceled.canceled_at
        })
      }

      return {
        success: true,
        canceledCount: results.length,
        details: results
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        canceledCount: 0,
        details: [{ error: errorMessage }]
      }
    }
  }

  /**
   * Verify customer deletion (check if customer still exists)
   */
  async verifyDeletion(customerId: string): Promise<{ verified: boolean; exists: boolean; details: any }> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId)
      
      // If customer is deleted, Stripe returns { id, deleted: true }
      if ('deleted' in customer && customer.deleted) {
        return {
          verified: true,
          exists: false,
          details: { customerId, deleted: true, verifiedAt: new Date().toISOString() }
        }
      }

      return {
        verified: true,
        exists: true,
        details: { customerId, deleted: false, verifiedAt: new Date().toISOString() }
      }
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError
      
      // If customer not found, deletion is verified
      if (stripeError?.code === 'resource_missing') {
        return {
          verified: true,
          exists: false,
          details: { customerId, notFound: true, verifiedAt: new Date().toISOString() }
        }
      }

      return {
        verified: false,
        exists: false,
        details: { error: stripeError?.message || 'Unknown error' }
      }
    }
  }

  /**
   * Get deletion receipt with full audit trail
   */
  async generateDeletionReceipt(
    userId: string,
    emails: string[],
    deletionResult: StripeDeletionResult
  ): Promise<{
    receiptId: string
    timestamp: string
    userId: string
    emails: string[]
    stripeCustomerId: string | null
    deletionStatus: 'COMPLETED' | 'NO_DATA' | 'FAILED'
    deletedResources: StripeDeletionResult['deletedResources']
    isTestMode: boolean
    apiResponse: any
  }> {
    return {
      receiptId: deletionResult.receipt || `stripe_receipt_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId,
      emails,
      stripeCustomerId: deletionResult.customerId || null,
      deletionStatus: deletionResult.success 
        ? (deletionResult.customerId ? 'COMPLETED' : 'NO_DATA')
        : 'FAILED',
      deletedResources: deletionResult.deletedResources,
      isTestMode: this.isTestMode,
      apiResponse: deletionResult.apiResponse
    }
  }

  /**
   * Check if running in test mode
   */
  isInTestMode(): boolean {
    return this.isTestMode
  }
}

// Singleton instance for easy access
let _stripeConnector: StripeConnector | null = null

export const getStripeConnector = (): StripeConnector => {
  if (!_stripeConnector) {
    _stripeConnector = new StripeConnector()
  }
  return _stripeConnector
}

// For backward compatibility - lazy initialization
export const stripeConnector = {
  deleteCustomer: async (userId: string, emails: string[]) => {
    return getStripeConnector().deleteCustomer(userId, emails)
  },
  cancelSubscriptions: async (customerId: string) => {
    return getStripeConnector().cancelSubscriptions(customerId)
  },
  verifyDeletion: async (customerId: string) => {
    return getStripeConnector().verifyDeletion(customerId)
  },
  searchCustomersByEmail: async (email: string) => {
    return getStripeConnector().searchCustomersByEmail(email)
  },
  findCustomersByEmails: async (emails: string[]) => {
    return getStripeConnector().findCustomersByEmails(emails)
  }
}
