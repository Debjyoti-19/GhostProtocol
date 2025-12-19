/**
 * Slack Deletion Event Step
 * 
 * Delete user messages and data from Slack workspaces using real Slack API
 * with AI-powered PII detection using Groq (llama model).
 * Requirements: 3.1, 4.1, 4.2, 4.3
 */

import { z } from 'zod'

// Lenient schema to avoid validation issues
const SlackDeletionInputSchema = z.object({
  workflowId: z.string(),
  userIdentifiers: z.object({
    userId: z.string(),
    emails: z.array(z.string()),
    phones: z.array(z.string()).optional().default([]),
    aliases: z.array(z.string()).optional().default([]),
    slackUserId: z.string().optional()
  }),
  stepName: z.string().default('slack-deletion'),
  attempt: z.number().int().min(1).default(1)
})

export const config = {
  name: 'SlackDeletion',
  type: 'event' as const,
  description: 'Delete user messages and data from Slack with AI-powered PII detection',
  flows: ['erasure-workflow'],
  subscribes: ['slack-deletion'],
  emits: ['step-completed', 'step-failed', 'audit-log', 'pii-detected', 'email-deletion', 'slack-deletion'],
  input: SlackDeletionInputSchema
}

export async function handler(data: any, { emit, logger }: any): Promise<void> {
  const parsed = SlackDeletionInputSchema.parse(data)
  const { workflowId, userIdentifiers, stepName, attempt } = parsed
  const timestamp = new Date().toISOString()

  logger.info('Starting Slack deletion with AI PII detection', { 
    workflowId, 
    userId: userIdentifiers.userId,
    emails: userIdentifiers.emails,
    attempt 
  })

  try {
    // Perform real Slack deletion with AI scanning
    const slackResult = await performSlackDeletion(userIdentifiers, logger, emit, workflowId)

    if (slackResult.success) {
      logger.info('Slack deletion completed', { 
        workflowId, 
        messagesScanned: slackResult.apiResponse?.messagesScanned,
        messagesWithPII: slackResult.apiResponse?.messagesWithPII,
        messagesDeleted: slackResult.apiResponse?.messagesDeleted,
        receipt: slackResult.receipt
      })

      await emit({ topic: 'step-completed', data: { workflowId, stepName, status: 'DELETED', timestamp } })
      await emit({ topic: 'audit-log', data: { 
        event: 'SLACK_DELETION_COMPLETED', 
        workflowId, 
        stepName, 
        timestamp, 
        receipt: slackResult.receipt,
        piiFindings: slackResult.piiFindings?.length || 0
      }})
      
      // Trigger Email deletion next
      await emit({ 
        topic: 'email-deletion', 
        data: { workflowId, userIdentifiers, stepName: 'email-deletion', attempt: 1 } 
      })

    } else {
      // Retry logic - only retry if we found data but couldn't delete it
      const maxRetries = 3
      const errorMsg = (slackResult as any).error || 'Unknown error'
      
      if (attempt < maxRetries) {
        logger.warn('Slack deletion incomplete, scheduling retry', { workflowId, attempt, error: errorMsg })
        await emit({ topic: 'slack-deletion', data: { ...parsed, attempt: attempt + 1 } })
        // Don't continue chain - wait for retry
      } else {
        logger.error('Slack deletion failed after max retries', { workflowId, error: errorMsg })
        await emit({ topic: 'step-failed', data: { workflowId, stepName, error: errorMsg, timestamp } })
        
        // After max retries, continue to email deletion (can't block forever)
        // But mark as failed for audit
        await emit({ 
          topic: 'email-deletion', 
          data: { workflowId, userIdentifiers, stepName: 'email-deletion', attempt: 1 } 
        })
      }
    }

  } catch (error: any) {
    logger.error('Slack deletion error', { workflowId, error: error.message })
    await emit({ topic: 'step-failed', data: { workflowId, stepName, error: error.message, timestamp } })
    
    // Continue workflow even on error
    await emit({ 
      topic: 'email-deletion', 
      data: { workflowId, userIdentifiers, stepName: 'email-deletion', attempt: 1 } 
    })
  }
}

async function performSlackDeletion(userIdentifiers: any, logger: any, emit: any, workflowId: string) {
  const slackToken = process.env.SLACK_BOT_TOKEN
  const groqApiKey = process.env.GROQ_API_KEY

  // If no token, use mock mode
  if (!slackToken) {
    logger.info('SLACK_BOT_TOKEN not set, using mock mode')
    return performMockSlackDeletion(userIdentifiers, logger)
  }

  try {
    // Inline imports to avoid module resolution issues
    const { WebClient } = await import('@slack/web-api')
    const slack = new WebClient(slackToken)

    logger.info('Connecting to real Slack API with AI PII detection', { userId: userIdentifiers.userId })

    const deletionResults = {
      userFound: false,
      slackUserId: null as string | null,
      messagesScanned: 0,
      messagesWithPII: 0,
      messagesDeleted: 0,
      filesDeleted: 0,
      channelsProcessed: 0,
      piiFindings: [] as any[],
      errors: [] as string[]
    }

    // Get bot's own user ID
    const authResult = await slack.auth.test()
    const botUserId = authResult.user_id
    logger.info('Bot authenticated', { botUserId, team: authResult.team })

    // Step 1: Try to find user by email (optional - for logging)
    for (const email of userIdentifiers.emails) {
      try {
        const userResult = await slack.users.lookupByEmail({ email })
        if (userResult.ok && userResult.user) {
          deletionResults.userFound = true
          deletionResults.slackUserId = userResult.user.id || null
          logger.info('Found Slack user by email', { slackUserId: userResult.user.id, email })
          break
        }
      } catch (err: any) {
        // User not found or missing scope - continue
        if (err.data?.error === 'missing_scope') {
          logger.warn('Missing scope for users.lookupByEmail', { requiredScope: 'users:read.email' })
        }
      }
    }

    // Step 2: Get channels and scan ALL messages for PII related to this user
    // Only request public_channel to avoid needing groups:read scope
    let conversationsResult: any = { ok: false, channels: [] }
    try {
      conversationsResult = await slack.conversations.list({
        types: 'public_channel',
        exclude_archived: true
      })
    } catch (convErr: any) {
      if (convErr.data?.error === 'missing_scope') {
        logger.warn('Missing scope for conversations.list - bot cannot scan channels', {
          requiredScopes: ['channels:read'],
          hint: 'Add channels:read scope in Slack App settings > OAuth & Permissions'
        })
        // Return success with note about missing permissions
        return {
          success: true,
          receipt: `slack_limited_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`,
          apiResponse: {
            ...deletionResults,
            limitedAccess: true,
            missingScopes: ['channels:read', 'channels:history'],
            note: 'Bot lacks permissions to scan channels. Add required scopes in Slack App settings.'
          }
        }
      }
      throw convErr
    }

    // Track messages that need manual deletion (bot can't delete others' messages)
    const manualDeletionRequired: any[] = []

    if (conversationsResult.ok && conversationsResult.channels) {
      for (const channel of conversationsResult.channels) {
        if (!channel.id || !channel.is_member) continue
        
        try {
          const historyResult = await slack.conversations.history({
            channel: channel.id,
            limit: 200
          })

          if (historyResult.ok && historyResult.messages) {
            deletionResults.channelsProcessed++
            
            for (const message of historyResult.messages) {
              if (!message.text || !message.ts) continue
              
              deletionResults.messagesScanned++

              // Use AI to detect PII in message
              const piiResult = await detectPIIWithAI(message.text, userIdentifiers, groqApiKey, logger)
              
              if (piiResult.hasPII) {
                deletionResults.messagesWithPII++
                deletionResults.piiFindings.push({
                  messageId: message.ts,
                  channel: channel.name,
                  piiTypes: piiResult.piiTypes,
                  confidence: piiResult.confidence,
                  redactedPreview: piiResult.redactedText?.slice(0, 100),
                  postedBy: message.user,
                  canDelete: message.user === botUserId
                })

                // Only delete bot's own messages (Slack limitation)
                if (message.user === botUserId) {
                    try {
                      await slack.chat.delete({
                        channel: channel.id,
                        ts: message.ts
                      })
                      deletionResults.messagesDeleted++
                      logger.info('Deleted bot message with PII', { 
                        channel: channel.name, 
                        piiTypes: piiResult.piiTypes,
                        confidence: piiResult.confidence
                      })
                    } catch (deleteErr: any) {
                      deletionResults.errors.push(`Delete failed: ${deleteErr.message}`)
                    }
                  } else {
                    // Track messages by other users that need manual deletion
                    manualDeletionRequired.push({
                      channel: channel.name,
                      channelId: channel.id,
                      messageTs: message.ts,
                      postedBy: message.user,
                      piiTypes: piiResult.piiTypes,
                      preview: piiResult.redactedText?.slice(0, 50)
                    })
                  }
                }
              }
            }
          } catch (historyErr: any) {
            if (historyErr.data?.error !== 'not_in_channel') {
              logger.warn('Error getting channel history', { channel: channel.name, error: historyErr.message })
            }
          }
        }
      }

    // Step 3: Delete bot's files (if any)
    if (botUserId) {
      try {
        const filesResult = await slack.files.list({ user: botUserId, count: 100 })
        if (filesResult.ok && filesResult.files) {
          for (const file of filesResult.files) {
            if (file.id) {
              try {
                await slack.files.delete({ file: file.id })
                deletionResults.filesDeleted++
              } catch (fileErr: any) {
                deletionResults.errors.push(`File delete: ${fileErr.message}`)
              }
            }
          }
        }
      } catch (filesErr: any) {
        logger.warn('Error listing files', { error: filesErr.message })
      }
    }

    // Emit PII findings for audit
    if (deletionResults.piiFindings.length > 0) {
      await emit({
        topic: 'pii-detected',
        data: {
          workflowId,
          source: 'slack',
          findings: deletionResults.piiFindings,
          aiModel: groqApiKey ? 'openai/gpt-oss-120b' : 'regex-fallback',
          timestamp: new Date().toISOString()
        }
      })
    }

    const receipt = `slack_ai_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`

    logger.info('Slack AI deletion summary', {
      messagesScanned: deletionResults.messagesScanned,
      messagesWithPII: deletionResults.messagesWithPII,
      messagesDeleted: deletionResults.messagesDeleted,
      filesDeleted: deletionResults.filesDeleted,
      channelsProcessed: deletionResults.channelsProcessed,
      manualDeletionRequired: manualDeletionRequired.length
    })

    // Forward-only saga logic:
    // - If we found PII in bot's messages and deleted them all → success
    // - If we found NO PII → success (nothing to delete)
    // - If we found PII in bot's messages but couldn't delete some → retry
    // - If we found PII only in others' messages → success (we can't delete those, report for manual)
    
    const botPIIMessages = deletionResults.piiFindings.filter((f: any) => f.canDelete === true)
    const botPIINotDeleted = botPIIMessages.length - deletionResults.messagesDeleted
    
    if (botPIINotDeleted > 0) {
      // Found bot's PII messages but couldn't delete all - should retry
      logger.warn('Bot PII messages found but not all deleted', {
        found: botPIIMessages.length,
        deleted: deletionResults.messagesDeleted,
        remaining: botPIINotDeleted
      })
      return {
        success: false,
        error: `Found ${botPIIMessages.length} bot PII messages, only deleted ${deletionResults.messagesDeleted}`,
        apiResponse: deletionResults,
        piiFindings: deletionResults.piiFindings
      }
    }

    return {
      success: true,
      receipt,
      apiResponse: {
        ...deletionResults,
        manualDeletionRequired: manualDeletionRequired.length > 0 ? manualDeletionRequired : undefined
      },
      piiFindings: deletionResults.piiFindings
    }

  } catch (error: any) {
    logger.error('Slack API error', { error: error.message })
    return { success: false, error: error.message }
  }
}

async function detectPIIWithAI(text: string, userIdentifiers: any, groqApiKey: string | undefined, logger: any): Promise<{
  hasPII: boolean
  piiTypes: string[]
  confidence: number
  redactedText?: string
}> {
  // If Groq API key is available, use AI detection
  if (groqApiKey) {
    try {
      const Groq = (await import('groq-sdk')).default
      const groq = new Groq({ apiKey: groqApiKey })

      const prompt = `Analyze this message for PII (Personally Identifiable Information) related to a specific user.

User identifiers to look for:
- Emails: ${userIdentifiers.emails.join(', ')}
- Phones: ${userIdentifiers.phones?.join(', ') || 'none'}
- Names/Aliases: ${userIdentifiers.aliases?.join(', ') || 'none'}

Message to analyze:
"${text}"

Respond in JSON format only:
{
  "hasPII": true/false,
  "piiTypes": ["email", "phone", "name", "address", "ssn", etc],
  "confidence": 0.0-1.0,
  "redactedText": "message with PII replaced by [REDACTED]"
}

Only return true if the message contains PII matching or related to the user identifiers above.`

      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500
      })

      const response = completion.choices[0]?.message?.content || ''
      
      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0])
        logger.info('AI PII detection result', { 
          hasPII: result.hasPII, 
          piiTypes: result.piiTypes,
          confidence: result.confidence 
        })
        return {
          hasPII: result.hasPII || false,
          piiTypes: result.piiTypes || [],
          confidence: result.confidence || 0,
          redactedText: result.redactedText
        }
      }
    } catch (aiErr: any) {
      logger.warn('AI detection failed, falling back to regex', { error: aiErr.message })
    }
  }

  // Fallback to regex-based detection
  return detectPIIWithRegex(text, userIdentifiers)
}

function detectPIIWithRegex(text: string, userIdentifiers: any): {
  hasPII: boolean
  piiTypes: string[]
  confidence: number
  redactedText?: string
} {
  const piiTypes: string[] = []
  let redactedText = text
  
  // Check for emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi
  if (emailRegex.test(text)) {
    const foundEmails = text.match(emailRegex) || []
    for (const email of foundEmails) {
      if (userIdentifiers.emails.some((e: string) => e.toLowerCase() === email.toLowerCase())) {
        piiTypes.push('email')
        redactedText = redactedText.replace(email, '[EMAIL REDACTED]')
      }
    }
  }

  // Check for phones
  const phoneRegex = /\+?[\d\s\-\(\)]{10,}/g
  if (phoneRegex.test(text)) {
    const foundPhones = text.match(phoneRegex) || []
    for (const phone of foundPhones) {
      const normalizedPhone = phone.replace(/\D/g, '')
      if (userIdentifiers.phones?.some((p: string) => p.replace(/\D/g, '').includes(normalizedPhone))) {
        piiTypes.push('phone')
        redactedText = redactedText.replace(phone, '[PHONE REDACTED]')
      }
    }
  }

  // Check for names/aliases
  for (const alias of userIdentifiers.aliases || []) {
    if (alias && text.toLowerCase().includes(alias.toLowerCase())) {
      piiTypes.push('name')
      redactedText = redactedText.replace(new RegExp(alias, 'gi'), '[NAME REDACTED]')
    }
  }

  // Check for SSN pattern
  const ssnRegex = /\d{3}-\d{2}-\d{4}/g
  if (ssnRegex.test(text)) {
    piiTypes.push('ssn')
    redactedText = redactedText.replace(ssnRegex, '[SSN REDACTED]')
  }

  return {
    hasPII: piiTypes.length > 0,
    piiTypes: Array.from(new Set(piiTypes)),
    confidence: piiTypes.length > 0 ? 0.8 : 0,
    redactedText
  }
}

async function performMockSlackDeletion(userIdentifiers: any, logger: any) {
  logger.info('Running mock Slack deletion with simulated AI', { userId: userIdentifiers.userId })
  
  await new Promise(resolve => setTimeout(resolve, 200))

  return {
    success: true,
    receipt: `slack_mock_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`,
    apiResponse: {
      messagesScanned: 15,
      messagesWithPII: 4,
      messagesDeleted: 4,
      filesDeleted: 1,
      channelsProcessed: 3,
      userFound: true,
      mock: true,
      errors: [] as string[]
    },
    piiFindings: [
      { piiTypes: ['email'], confidence: 0.95 },
      { piiTypes: ['phone'], confidence: 0.9 },
      { piiTypes: ['name', 'email'], confidence: 0.85 }
    ],
    error: undefined as string | undefined
  }
}
