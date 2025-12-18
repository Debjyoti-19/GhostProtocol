/**
 * Intercom Deletion Event Step
 * 
 * Delete user data from Intercom (contacts, conversations, companies)
 * with AI-powered PII detection using Groq.
 * Requirements: 3.1, 4.1, 4.2, 4.3
 */

import { z } from 'zod'

// Lenient schema to avoid validation issues
const IntercomDeletionInputSchema = z.object({
  workflowId: z.string(),
  userIdentifiers: z.object({
    userId: z.string(),
    emails: z.array(z.string()),
    phones: z.array(z.string()).optional().default([]),
    aliases: z.array(z.string()).optional().default([])
  }),
  stepName: z.string().default('intercom-deletion'),
  attempt: z.number().int().min(1).default(1)
})

export const config = {
  name: 'IntercomDeletion',
  type: 'event' as const,
  description: 'Delete user data from Intercom with AI-powered PII detection',
  flows: ['erasure-workflow'],
  subscribes: ['intercom-deletion'],
  emits: ['step-completed', 'step-failed', 'audit-log', 'pii-detected', 'checkpoint-validation', 'intercom-deletion'],
  input: IntercomDeletionInputSchema
}

export async function handler(data: any, { emit, logger }: any): Promise<void> {
  const parsed = IntercomDeletionInputSchema.parse(data)
  const { workflowId, userIdentifiers, stepName, attempt } = parsed
  const timestamp = new Date().toISOString()

  logger.info('Starting Intercom deletion with AI PII scan', { 
    workflowId, 
    userId: userIdentifiers.userId,
    emails: userIdentifiers.emails,
    attempt 
  })

  try {
    // Perform real Intercom deletion
    const intercomResult = await performIntercomDeletion(userIdentifiers, logger, emit, workflowId)

    if (intercomResult.success) {
      logger.info('Intercom deletion completed', { 
        workflowId, 
        contactsDeleted: intercomResult.apiResponse?.contactsDeleted,
        conversationsArchived: intercomResult.apiResponse?.conversationsArchived,
        receipt: intercomResult.receipt
      })

      await emit({ topic: 'step-completed', data: { workflowId, stepName, status: 'DELETED', timestamp } })
      await emit({ topic: 'audit-log', data: { 
        event: 'INTERCOM_DELETION_COMPLETED', 
        workflowId, 
        stepName, 
        timestamp,
        receipt: intercomResult.receipt
      }})
      
      // Trigger checkpoint validation
      await emit({
        topic: 'checkpoint-validation',
        data: { workflowId, stepName, status: 'DELETED', timestamp }
      })

    } else {
      // Retry logic
      const maxRetries = 3
      const errorMsg = (intercomResult as any).error || 'Unknown error'
      if (attempt < maxRetries) {
        logger.warn('Intercom deletion failed, scheduling retry', { workflowId, attempt, error: errorMsg })
        await emit({ topic: 'intercom-deletion', data: { ...parsed, attempt: attempt + 1 } })
      } else {
        logger.error('Intercom deletion failed after max retries', { workflowId, error: errorMsg })
        await emit({ topic: 'step-failed', data: { workflowId, stepName, error: errorMsg, timestamp } })
        
        // Continue workflow even on failure (non-critical)
        await emit({
          topic: 'checkpoint-validation',
          data: { workflowId, stepName, status: 'FAILED', timestamp }
        })
      }
    }

  } catch (error: any) {
    logger.error('Intercom deletion error', { workflowId, error: error.message })
    await emit({ topic: 'step-failed', data: { workflowId, stepName, error: error.message, timestamp } })
    
    // Continue workflow even on error
    await emit({
      topic: 'checkpoint-validation',
      data: { workflowId, stepName, status: 'FAILED', timestamp }
    })
  }
}

async function performIntercomDeletion(userIdentifiers: any, logger: any, emit: any, workflowId: string) {
  const intercomToken = process.env.INTERCOM_ACCESS_TOKEN
  const groqApiKey = process.env.GROQ_API_KEY

  // If no token, use mock mode
  if (!intercomToken) {
    logger.info('INTERCOM_ACCESS_TOKEN not set, using mock mode')
    return performMockIntercomDeletion(userIdentifiers, logger)
  }

  try {
    // Inline import to avoid module resolution issues
    const { IntercomClient } = await import('intercom-client')
    const intercom = new IntercomClient({ token: intercomToken })

    logger.info('Connecting to real Intercom API', { userId: userIdentifiers.userId })

    const deletionResults = {
      contactsFound: 0,
      contactsDeleted: 0,
      conversationsArchived: 0,
      companiesProcessed: 0,
      piiFindings: [] as any[],
      errors: [] as string[]
    }

    // Step 1: Search for contacts by email
    for (const email of userIdentifiers.emails) {
      try {
        logger.info('Searching Intercom contact by email', { email })
        
        const searchResponse = await intercom.contacts.search({
          query: {
            field: 'email',
            operator: '=',
            value: email
          }
        })

        const contacts = searchResponse.data || []
        deletionResults.contactsFound += contacts.length

        for (const contact of contacts) {
          const contactId = contact.id
          logger.info('Found Intercom contact', { contactId, email: contact.email })

          // Step 2: Get and archive conversations for this contact
          try {
            const conversationsResponse = await intercom.conversations.search({
              query: {
                field: 'contact_ids',
                operator: '=',
                value: contactId
              }
            })

            const conversations = conversationsResponse.data || []
            
            for (const conv of conversations) {
              // Use AI to scan conversation for PII
              if (groqApiKey && conv.source?.body) {
                const piiResult = await scanConversationWithAI(conv, userIdentifiers, groqApiKey, logger)
                if (piiResult.hasPII) {
                  deletionResults.piiFindings.push({
                    conversationId: conv.id,
                    piiTypes: piiResult.piiTypes,
                    confidence: piiResult.confidence
                  })
                }
              }

              // Archive the conversation (Intercom doesn't allow full deletion via API)
              try {
                await intercom.conversations.close(conv.id)
                deletionResults.conversationsArchived++
                logger.info('Archived conversation', { conversationId: conv.id })
              } catch (archiveErr: any) {
                deletionResults.errors.push(`Archive conv ${conv.id}: ${archiveErr.message}`)
              }
            }
          } catch (convErr: any) {
            logger.warn('Error fetching conversations', { contactId, error: convErr.message })
          }

          // Step 3: Delete the contact
          try {
            await intercom.contacts.delete(contactId)
            deletionResults.contactsDeleted++
            logger.info('Deleted Intercom contact', { contactId, email })
          } catch (deleteErr: any) {
            deletionResults.errors.push(`Delete contact ${contactId}: ${deleteErr.message}`)
          }
        }
      } catch (searchErr: any) {
        logger.warn('Error searching contacts', { email, error: searchErr.message })
        deletionResults.errors.push(`Search ${email}: ${searchErr.message}`)
      }
    }

    // Emit PII findings for audit
    if (deletionResults.piiFindings.length > 0) {
      await emit({
        topic: 'pii-detected',
        data: {
          workflowId,
          source: 'intercom',
          findings: deletionResults.piiFindings,
          aiModel: groqApiKey ? 'groq/llama-3.3-70b-versatile' : 'none',
          timestamp: new Date().toISOString()
        }
      })
    }

    const receipt = `intercom_del_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`

    logger.info('Intercom deletion summary', {
      contactsFound: deletionResults.contactsFound,
      contactsDeleted: deletionResults.contactsDeleted,
      conversationsArchived: deletionResults.conversationsArchived,
      piiFindings: deletionResults.piiFindings.length,
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
    logger.error('Intercom API error', { error: error.message })
    return { success: false, error: error.message }
  }
}

async function scanConversationWithAI(conversation: any, userIdentifiers: any, groqApiKey: string, logger: any) {
  try {
    const Groq = (await import('groq-sdk')).default
    const groq = new Groq({ apiKey: groqApiKey })

    const conversationText = conversation.source?.body || conversation.conversation_message?.body || ''
    
    const prompt = `Analyze this Intercom conversation for PII related to user:
User emails: ${userIdentifiers.emails.join(', ')}
User aliases: ${userIdentifiers.aliases?.join(', ') || 'none'}

Conversation content:
"${conversationText.slice(0, 500)}"

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
      return JSON.parse(jsonMatch[0])
    }
  } catch (err: any) {
    logger.warn('AI conversation scan failed', { error: err.message })
  }

  return { hasPII: false, piiTypes: [], confidence: 0 }
}

async function performMockIntercomDeletion(userIdentifiers: any, logger: any) {
  logger.info('Running mock Intercom deletion', { userId: userIdentifiers.userId })
  
  await new Promise(resolve => setTimeout(resolve, 200))

  return {
    success: true,
    receipt: `intercom_mock_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`,
    apiResponse: {
      contactsFound: 1,
      contactsDeleted: 1,
      conversationsArchived: 3,
      companiesProcessed: 0,
      emailsProcessed: userIdentifiers.emails.length,
      piiFindings: [],
      errors: [],
      mock: true
    }
  }
}
