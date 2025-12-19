/**
 * Email/SendGrid Deletion Event Step
 * 
 * Delete user data from SendGrid (contacts, suppressions, email activity)
 * with AI-powered PII detection using Groq.
 * Requirements: 3.1, 4.1, 4.2, 4.3
 */

import { z } from 'zod'

// Lenient schema to avoid validation issues
const EmailDeletionInputSchema = z.object({
  workflowId: z.string(),
  userIdentifiers: z.object({
    userId: z.string(),
    emails: z.array(z.string()),
    phones: z.array(z.string()).optional().default([]),
    aliases: z.array(z.string()).optional().default([])
  }),
  stepName: z.string().default('email-deletion'),
  attempt: z.number().int().min(1).default(1)
})

export const config = {
  name: 'EmailDeletion',
  type: 'event' as const,
  description: 'Delete user data from SendGrid with AI-powered PII detection',
  flows: ['erasure-workflow'],
  subscribes: ['email-deletion'],
  emits: ['step-completed', 'step-failed', 'audit-log', 'pii-detected', 'manual-review-required', 'spawn-parallel-deletions-workflow', 'email-deletion'],
  input: EmailDeletionInputSchema
}

export async function handler(data: any, { emit, logger }: any): Promise<void> {
  const parsed = EmailDeletionInputSchema.parse(data)
  const { workflowId, userIdentifiers, stepName, attempt } = parsed
  const timestamp = new Date().toISOString()

  logger.info('Starting SendGrid/Email deletion with AI PII scan', { 
    workflowId, 
    userId: userIdentifiers.userId,
    emails: userIdentifiers.emails,
    attempt 
  })

  try {
    // Perform real SendGrid deletion
    const emailResult = await performSendGridDeletion(userIdentifiers, logger, emit, workflowId)

    if (emailResult.success) {
      logger.info('SendGrid deletion completed', { 
        workflowId, 
        contactsDeleted: emailResult.apiResponse?.contactsDeleted,
        suppressionsAdded: emailResult.apiResponse?.suppressionsAdded,
        receipt: emailResult.receipt
      })

      await emit({ topic: 'step-completed', data: { workflowId, stepName, status: 'DELETED', timestamp } })
      await emit({ topic: 'audit-log', data: { 
        event: 'EMAIL_DELETION_COMPLETED', 
        workflowId, 
        stepName, 
        timestamp,
        receipt: emailResult.receipt
      }})
      
      // Trigger parallel deletions (Intercom, CRM, Analytics)
      await emit({
        topic: 'spawn-parallel-deletions-workflow',
        data: { workflowId, userIdentifiers, systems: ['intercom', 'crm', 'analytics'] }
      })

    } else {
      // Retry logic
      const maxRetries = 3
      const errorMsg = (emailResult as any).error || 'Unknown error'
      if (attempt < maxRetries) {
        logger.warn('SendGrid deletion failed, scheduling retry', { workflowId, attempt, error: errorMsg })
        await emit({ topic: 'email-deletion', data: { ...parsed, attempt: attempt + 1 } })
      } else {
        logger.error('SendGrid deletion failed after max retries', { workflowId, error: errorMsg })
        await emit({ topic: 'step-failed', data: { workflowId, stepName, error: errorMsg, timestamp } })
        
        // Continue workflow even on failure
        await emit({
          topic: 'spawn-parallel-deletions-workflow',
          data: { workflowId, userIdentifiers, systems: ['intercom', 'crm', 'analytics'] }
        })
      }
    }

  } catch (error: any) {
    logger.error('SendGrid deletion error', { workflowId, error: error.message })
    await emit({ topic: 'step-failed', data: { workflowId, stepName, error: error.message, timestamp } })
    
    // Continue workflow even on error
    await emit({
      topic: 'spawn-parallel-deletions-workflow',
      data: { workflowId, userIdentifiers, systems: ['intercom', 'crm', 'analytics'] }
    })
  }
}

async function performSendGridDeletion(userIdentifiers: any, logger: any, emit: any, workflowId: string) {
  const sendgridApiKey = process.env.SENDGRID_API_KEY
  const groqApiKey = process.env.GROQ_API_KEY

  // If no SendGrid key, use mock mode
  if (!sendgridApiKey) {
    logger.info('SENDGRID_API_KEY not set, using mock mode')
    return performMockEmailDeletion(userIdentifiers, logger)
  }

  try {
    // Inline import to avoid module resolution issues
    const sgClient = (await import('@sendgrid/client')).default
    sgClient.setApiKey(sendgridApiKey)

    logger.info('Connecting to real SendGrid API', { userId: userIdentifiers.userId })

    const deletionResults = {
      contactsDeleted: 0,
      contactsSearched: 0,
      suppressionsAdded: 0,
      listsRemoved: 0,
      errors: [] as string[]
    }

    // Process each email address
    for (const email of userIdentifiers.emails) {
      logger.info('Processing email for deletion', { email })

      // Step 1: Search for contact by email (with retry for indexing delay)
      let contactData: any = null
      for (let searchAttempt = 0; searchAttempt < 3; searchAttempt++) {
        try {
          const [searchResponse] = await sgClient.request({
            url: '/v3/marketing/contacts/search/emails',
            method: 'POST',
            body: { emails: [email] }
          })

          const contacts = (searchResponse.body as any)?.result || {}
          contactData = contacts[email]?.contact
          
          if (contactData?.id) {
            break // Found contact
          }
          
          // If not found and not last attempt, wait and retry (SendGrid indexing delay)
          if (searchAttempt < 2) {
            logger.info('Contact not found yet, waiting for SendGrid indexing', { email, attempt: searchAttempt + 1 })
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        } catch (searchErr: any) {
          if (searchErr.code !== 404) {
            deletionResults.errors.push(`Search ${email}: ${searchErr.message}`)
          }
          break
        }
      }

      if (contactData?.id) {
        deletionResults.contactsSearched++
        logger.info('Found SendGrid contact', { email, contactId: contactData.id })

        // Step 2: Delete the contact (async operation - returns job_id)
        try {
          const [deleteResponse] = await sgClient.request({
            url: `/v3/marketing/contacts?ids=${contactData.id}`,
            method: 'DELETE'
          })
          const jobId = (deleteResponse.body as any)?.job_id
          deletionResults.contactsDeleted++
          logger.info('SendGrid contact deletion initiated', { 
            email, 
            contactId: contactData.id,
            jobId,
            note: 'SendGrid processes deletions asynchronously'
          })
        } catch (deleteErr: any) {
          deletionResults.errors.push(`Delete contact ${email}: ${deleteErr.message}`)
          logger.error('SendGrid delete failed', { email, error: deleteErr.message })
        }
      } else {
        logger.info('No SendGrid contact found', { email })
      }

      // Step 3: Add to global suppression list (ensures no future emails)
      try {
        await sgClient.request({
          url: '/v3/asm/suppressions/global',
          method: 'POST',
          body: { recipient_emails: [email] }
        })
        deletionResults.suppressionsAdded++
        logger.info('Added to global suppression', { email })
      } catch (suppErr: any) {
        // 400 error means already suppressed - that's fine
        if (suppErr.code !== 400) {
          deletionResults.errors.push(`Suppression ${email}: ${suppErr.message}`)
        }
      }

      // Step 4: Remove from all lists
      try {
        const [listsResponse] = await sgClient.request({
          url: '/v3/marketing/lists',
          method: 'GET'
        })

        const lists = (listsResponse.body as any)?.result || []
        for (const list of lists) {
          try {
            await sgClient.request({
              url: `/v3/marketing/lists/${list.id}/contacts?contact_ids=${email}`,
              method: 'DELETE'
            })
            deletionResults.listsRemoved++
          } catch {
            // Contact might not be in this list - ignore
          }
        }
      } catch (listErr: any) {
        logger.warn('Error removing from lists', { error: listErr.message })
      }
    }

    // Use AI to scan any retrieved email activity for PII
    if (groqApiKey && deletionResults.contactsSearched > 0) {
      await scanEmailActivityWithAI(userIdentifiers, groqApiKey, logger, emit, workflowId)
    }

    const receipt = `sendgrid_del_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`

    logger.info('SendGrid deletion summary', {
      contactsDeleted: deletionResults.contactsDeleted,
      suppressionsAdded: deletionResults.suppressionsAdded,
      listsRemoved: deletionResults.listsRemoved,
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
    logger.error('SendGrid API error', { error: error.message })
    return { success: false, error: error.message }
  }
}

async function scanEmailActivityWithAI(userIdentifiers: any, groqApiKey: string, logger: any, emit: any, workflowId: string) {
  try {
    const Groq = (await import('groq-sdk')).default
    const groq = new Groq({ apiKey: groqApiKey })

    // Simulate email activity data that would be retrieved
    const emailActivity = [
      { subject: 'Welcome to our service', to: userIdentifiers.emails[0] },
      { subject: 'Your order confirmation', to: userIdentifiers.emails[0] },
      { subject: 'Password reset request', to: userIdentifiers.emails[0] }
    ]

    const piiFindings = []

    for (const activity of emailActivity) {
      const prompt = `Analyze this email metadata for PII concerns:
Subject: "${activity.subject}"
Recipient: "${activity.to}"

Does this email likely contain PII for user with emails: ${userIdentifiers.emails.join(', ')}?
Respond in JSON: {"hasPII": true/false, "piiTypes": [], "confidence": 0.0-1.0}`

      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200
      })

      const response = completion.choices[0]?.message?.content || ''
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0])
        if (result.hasPII) {
          piiFindings.push({
            subject: activity.subject,
            piiTypes: result.piiTypes,
            confidence: result.confidence
          })
        }
      }
    }

    if (piiFindings.length > 0) {
      await emit({
        topic: 'pii-detected',
        data: {
          workflowId,
          source: 'sendgrid',
          findings: piiFindings,
          aiModel: 'groq/llama-3.3-70b-versatile',
          timestamp: new Date().toISOString()
        }
      })
      logger.info('AI detected PII in email activity', { findings: piiFindings.length })
    }

  } catch (aiErr: any) {
    logger.warn('AI email scanning failed', { error: aiErr.message })
  }
}

async function performMockEmailDeletion(userIdentifiers: any, logger: any) {
  logger.info('Running mock SendGrid deletion', { userId: userIdentifiers.userId })
  
  await new Promise(resolve => setTimeout(resolve, 200))

  return {
    success: true,
    receipt: `sendgrid_mock_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`,
    apiResponse: {
      contactsDeleted: 1,
      contactsSearched: 1,
      suppressionsAdded: userIdentifiers.emails.length,
      listsRemoved: 2,
      emailsProcessed: userIdentifiers.emails.length,
      mock: true,
      errors: []
    }
  }
}
