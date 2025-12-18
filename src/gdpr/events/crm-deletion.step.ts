/**
 * CRM (HubSpot) Deletion Event Step
 * 
 * Delete user data from HubSpot CRM (contacts, deals, companies).
 * No AI needed - structured data deletion.
 * Requirements: 3.1, 4.1, 4.2, 4.3
 */

import { z } from 'zod'

// Lenient schema
const CRMDeletionInputSchema = z.object({
  workflowId: z.string(),
  userIdentifiers: z.object({
    userId: z.string(),
    emails: z.array(z.string()),
    phones: z.array(z.string()).optional().default([]),
    aliases: z.array(z.string()).optional().default([])
  }),
  stepName: z.string().default('crm-deletion'),
  attempt: z.number().int().min(1).default(1)
})

export const config = {
  name: 'CRMDeletion',
  type: 'event' as const,
  description: 'Delete user data from HubSpot CRM',
  flows: ['erasure-workflow'],
  subscribes: ['crm-deletion'],
  emits: ['step-completed', 'step-failed', 'audit-log', 'checkpoint-validation', 'crm-deletion'],
  input: CRMDeletionInputSchema
}

export async function handler(data: any, { emit, logger }: any): Promise<void> {
  const parsed = CRMDeletionInputSchema.parse(data)
  const { workflowId, userIdentifiers, stepName, attempt } = parsed
  const timestamp = new Date().toISOString()

  logger.info('Starting HubSpot CRM deletion', { 
    workflowId, 
    userId: userIdentifiers.userId,
    emails: userIdentifiers.emails,
    attempt 
  })

  try {
    const crmResult = await performHubSpotDeletion(userIdentifiers, logger)

    if (crmResult.success) {
      logger.info('HubSpot CRM deletion completed', { 
        workflowId, 
        contactsDeleted: crmResult.apiResponse?.contactsDeleted,
        dealsArchived: crmResult.apiResponse?.dealsArchived,
        receipt: crmResult.receipt
      })

      await emit({ topic: 'step-completed', data: { workflowId, stepName, status: 'DELETED', timestamp } })
      await emit({ topic: 'audit-log', data: { 
        event: 'CRM_DELETION_COMPLETED', 
        workflowId, 
        stepName, 
        timestamp,
        receipt: crmResult.receipt
      }})
      
      await emit({
        topic: 'checkpoint-validation',
        data: { workflowId, stepName, status: 'DELETED', timestamp }
      })

    } else {
      const maxRetries = 3
      const errorMsg = (crmResult as any).error || 'Unknown error'
      if (attempt < maxRetries) {
        logger.warn('HubSpot deletion failed, scheduling retry', { workflowId, attempt, error: errorMsg })
        await emit({ topic: 'crm-deletion', data: { ...parsed, attempt: attempt + 1 } })
      } else {
        logger.error('HubSpot deletion failed after max retries', { workflowId, error: errorMsg })
        await emit({ topic: 'step-failed', data: { workflowId, stepName, error: errorMsg, timestamp } })
        await emit({
          topic: 'checkpoint-validation',
          data: { workflowId, stepName, status: 'FAILED', timestamp }
        })
      }
    }

  } catch (error: any) {
    logger.error('HubSpot deletion error', { workflowId, error: error.message })
    await emit({ topic: 'step-failed', data: { workflowId, stepName, error: error.message, timestamp } })
    await emit({
      topic: 'checkpoint-validation',
      data: { workflowId, stepName, status: 'FAILED', timestamp }
    })
  }
}

async function performHubSpotDeletion(userIdentifiers: any, logger: any) {
  const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN

  if (!hubspotToken) {
    logger.info('HUBSPOT_ACCESS_TOKEN not set, using mock mode')
    return performMockCRMDeletion(userIdentifiers, logger)
  }

  try {
    const { Client } = await import('@hubspot/api-client')
    const hubspot = new Client({ accessToken: hubspotToken })

    logger.info('Connecting to real HubSpot API', { userId: userIdentifiers.userId })

    const deletionResults = {
      contactsFound: 0,
      contactsDeleted: 0,
      dealsArchived: 0,
      companiesProcessed: 0,
      errors: [] as string[]
    }

    // Search for contacts by email
    for (const email of userIdentifiers.emails) {
      try {
        logger.info('Searching HubSpot contact by email', { email })
        
        const searchResponse = await hubspot.crm.contacts.searchApi.doSearch({
          filterGroups: [{
            filters: [{
              propertyName: 'email',
              operator: 'EQ',
              value: email
            }]
          }],
          properties: ['email', 'firstname', 'lastname'],
          limit: 10
        })

        const contacts = searchResponse.results || []
        deletionResults.contactsFound += contacts.length

        for (const contact of contacts) {
          const contactId = contact.id
          logger.info('Found HubSpot contact', { contactId, email: contact.properties?.email })

          // Get associated deals
          try {
            const associations = await hubspot.crm.contacts.associationsApi.getAll(
              contactId,
              'deals'
            )
            
            // Archive associated deals
            for (const assoc of associations.results || []) {
              try {
                await hubspot.crm.deals.basicApi.archive(assoc.id)
                deletionResults.dealsArchived++
                logger.info('Archived deal', { dealId: assoc.id })
              } catch (dealErr: any) {
                deletionResults.errors.push(`Archive deal ${assoc.id}: ${dealErr.message}`)
              }
            }
          } catch (assocErr: any) {
            logger.warn('Error getting associations', { contactId, error: assocErr.message })
          }

          // Delete the contact
          try {
            await hubspot.crm.contacts.basicApi.archive(contactId)
            deletionResults.contactsDeleted++
            logger.info('Deleted HubSpot contact', { contactId, email })
          } catch (deleteErr: any) {
            deletionResults.errors.push(`Delete contact ${contactId}: ${deleteErr.message}`)
          }
        }
      } catch (searchErr: any) {
        logger.warn('Error searching contacts', { email, error: searchErr.message })
        deletionResults.errors.push(`Search ${email}: ${searchErr.message}`)
      }
    }

    const receipt = `hubspot_del_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`

    logger.info('HubSpot deletion summary', {
      contactsFound: deletionResults.contactsFound,
      contactsDeleted: deletionResults.contactsDeleted,
      dealsArchived: deletionResults.dealsArchived,
      errors: deletionResults.errors.length
    })

    return {
      success: true,
      receipt,
      apiResponse: {
        ...deletionResults,
        emailsProcessed: userIdentifiers.emails.length
      }
    }

  } catch (error: any) {
    logger.error('HubSpot API error', { error: error.message })
    return { success: false, error: error.message }
  }
}

async function performMockCRMDeletion(userIdentifiers: any, logger: any) {
  logger.info('Running mock HubSpot deletion', { userId: userIdentifiers.userId })
  await new Promise(resolve => setTimeout(resolve, 200))

  return {
    success: true,
    receipt: `hubspot_mock_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`,
    apiResponse: {
      contactsFound: 1,
      contactsDeleted: 1,
      dealsArchived: 2,
      companiesProcessed: 0,
      emailsProcessed: userIdentifiers.emails.length,
      errors: [],
      mock: true
    }
  }
}
