/**
 * Slack Deletion Event Step
 * 
 * Delete user messages and data from Slack workspaces using AI agent
 * to detect PII in message content.
 * Requirements: 3.1, 4.1, 4.2, 4.3
 */

import { z } from 'zod'

class WorkflowStateError extends Error {
  constructor(workflowId: string, message: string) {
    super(`Workflow ${workflowId}: ${message}`)
    this.name = 'WorkflowStateError'
  }
}

const ghostProtocolConfig = {
  workflow: {
    maxRetryAttempts: 3,
    initialRetryDelay: 1000,
    retryBackoffMultiplier: 2
  }
}

const SlackDeletionInputSchema = z.object({
  workflowId: z.string().uuid(),
  userIdentifiers: z.object({
    userId: z.string().min(1),
    emails: z.array(z.string().email()),
    phones: z.array(z.string()),
    aliases: z.array(z.string()),
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
  emits: ['step-completed', 'step-failed', 'audit-log', 'pii-detected', 'email-deletion'],
  input: SlackDeletionInputSchema
}

export async function handler(data: any, { emit, logger, state }: any): Promise<void> {
  const { workflowId, userIdentifiers, stepName, attempt } = SlackDeletionInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Starting Slack deletion with AI PII scan', { 
    workflowId, 
    userId: userIdentifiers.userId,
    attempt 
  })

  try {
    const workflowState = await state.get(`workflow:${workflowId}`)
    if (!workflowState) {
      throw new WorkflowStateError(workflowId, 'Workflow not found')
    }

    if (!workflowState.identityCriticalCompleted) {
      throw new WorkflowStateError(workflowId, 'Identity-critical checkpoint not completed')
    }

    // Initialize step state
    if (!workflowState.steps[stepName]) {
      workflowState.steps[stepName] = {
        status: 'NOT_STARTED',
        attempts: 0,
        evidence: { timestamp }
      }
    }

    workflowState.steps[stepName].status = 'IN_PROGRESS'
    workflowState.steps[stepName].attempts = attempt
    await state.set(`workflow:${workflowId}`, workflowState)

    // Perform Slack deletion with AI PII detection
    const slackResult = await performSlackDeletion(userIdentifiers, logger, emit, workflowId)

    if (slackResult.success) {
      workflowState.steps[stepName].status = 'DELETED'
      workflowState.steps[stepName].evidence = {
        receipt: slackResult.receipt,
        timestamp,
        apiResponse: slackResult.apiResponse,
        piiFindings: slackResult.piiFindings
      }
      await state.set(`workflow:${workflowId}`, workflowState)

      logger.info('Slack deletion completed', { 
        workflowId, 
        messagesDeleted: slackResult.apiResponse?.messagesDeleted,
        piiDetected: slackResult.piiFindings?.length || 0
      })

      await emit({ topic: 'step-completed', data: { workflowId, stepName, status: 'DELETED', timestamp } })
      await emit({ topic: 'audit-log', data: { event: 'SLACK_DELETION_COMPLETED', workflowId, stepName, timestamp } })
      
      // Trigger Email deletion next (sequential AI scanning chain)
      await emit({ 
        topic: 'email-deletion', 
        data: { workflowId, userIdentifiers, stepName: 'email-deletion', attempt: 1 } 
      })

    } else {
      // Retry logic
      const maxRetries = ghostProtocolConfig.workflow.maxRetryAttempts
      if (attempt < maxRetries) {
        const retryDelay = ghostProtocolConfig.workflow.initialRetryDelay * Math.pow(2, attempt - 1)
        logger.warn('Slack deletion failed, retrying', { workflowId, attempt, retryDelay })
        
        setTimeout(async () => {
          await emit({ topic: 'slack-deletion', data: { ...data, attempt: attempt + 1 } })
        }, retryDelay)
      } else {
        workflowState.steps[stepName].status = 'FAILED'
        await state.set(`workflow:${workflowId}`, workflowState)
        
        await emit({ topic: 'step-failed', data: { workflowId, stepName, error: slackResult.error, timestamp } })
        await emit({ topic: 'parallel-step-completed', data: { workflowId, stepName, status: 'FAILED', timestamp } })
      }
    }

  } catch (error) {
    logger.error('Slack deletion failed', { workflowId, error: error.message })
    await emit({ topic: 'step-failed', data: { workflowId, stepName, error: error.message, timestamp } })
    throw error
  }
}

async function performSlackDeletion(userIdentifiers: any, logger: any, emit: any, workflowId: string) {
  try {
    logger.info('Scanning Slack messages for PII using AI agent', { userId: userIdentifiers.userId })

    // Simulate fetching user's Slack messages
    const mockMessages = [
      { id: 'msg1', text: `Hey, my email is ${userIdentifiers.emails[0] || 'user@example.com'}`, channel: 'general' },
      { id: 'msg2', text: 'Can you send the report to my phone?', channel: 'work' },
      { id: 'msg3', text: 'Meeting at 3pm tomorrow', channel: 'general' }
    ]

    // AI Agent PII Detection (simulated)
    const piiFindings = []
    for (const msg of mockMessages) {
      const piiResult = await detectPIIWithAgent(msg.text, userIdentifiers)
      if (piiResult.hasPII) {
        piiFindings.push({
          messageId: msg.id,
          channel: msg.channel,
          piiType: piiResult.piiType,
          confidence: piiResult.confidence,
          redactedSnippet: piiResult.redactedSnippet
        })
      }
    }

    // Emit PII findings for audit
    if (piiFindings.length > 0) {
      await emit({
        topic: 'pii-detected',
        data: {
          workflowId,
          source: 'slack',
          findings: piiFindings,
          timestamp: new Date().toISOString()
        }
      })
    }

    // Simulate deletion
    await new Promise(resolve => setTimeout(resolve, 300))

    const receipt = `slack_del_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`
    return {
      success: true,
      receipt,
      apiResponse: {
        messagesDeleted: mockMessages.length,
        channelsProcessed: 2,
        filesDeleted: 0,
        piiMessagesFound: piiFindings.length
      },
      piiFindings
    }

  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function detectPIIWithAgent(text: string, userIdentifiers: any) {
  // AI Agent simulation - in production, call actual LLM
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const phoneRegex = /\+?[\d\s\-\(\)]{10,}/g
  
  const hasEmail = emailRegex.test(text)
  const hasPhone = phoneRegex.test(text)
  const hasName = userIdentifiers.aliases?.some((alias: string) => 
    text.toLowerCase().includes(alias.toLowerCase())
  )

  if (hasEmail || hasPhone || hasName) {
    return {
      hasPII: true,
      piiType: hasEmail ? 'email' : hasPhone ? 'phone' : 'name',
      confidence: hasEmail ? 0.95 : hasPhone ? 0.85 : 0.7,
      redactedSnippet: text.replace(emailRegex, '[EMAIL]').replace(phoneRegex, '[PHONE]').slice(0, 50)
    }
  }

  return { hasPII: false }
}
