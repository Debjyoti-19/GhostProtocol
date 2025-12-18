/**
 * Email Systems Deletion Event Step
 * 
 * Delete user data from email systems (Gmail, Outlook, etc.) using AI agent
 * to detect PII in email content and attachments.
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

const EmailDeletionInputSchema = z.object({
  workflowId: z.string().uuid(),
  userIdentifiers: z.object({
    userId: z.string().min(1),
    emails: z.array(z.string().email()),
    phones: z.array(z.string()),
    aliases: z.array(z.string())
  }),
  stepName: z.string().default('email-deletion'),
  attempt: z.number().int().min(1).default(1)
})

export const config = {
  name: 'EmailDeletion',
  type: 'event' as const,
  description: 'Delete user data from email systems with AI-powered PII detection in content and attachments',
  flows: ['erasure-workflow'],
  subscribes: ['email-deletion'],
  emits: ['step-completed', 'step-failed', 'audit-log', 'pii-detected', 'manual-review-required', 'spawn-parallel-deletions-workflow'],
  input: EmailDeletionInputSchema
}

export async function handler(data: any, { emit, logger, state }: any): Promise<void> {
  const { workflowId, userIdentifiers, stepName, attempt } = EmailDeletionInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Starting Email deletion with AI PII scan', { 
    workflowId, 
    userId: userIdentifiers.userId,
    emailCount: userIdentifiers.emails.length,
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

    // Perform Email deletion with AI PII detection
    const emailResult = await performEmailDeletion(userIdentifiers, logger, emit, workflowId)

    if (emailResult.success) {
      workflowState.steps[stepName].status = 'DELETED'
      workflowState.steps[stepName].evidence = {
        receipt: emailResult.receipt,
        timestamp,
        apiResponse: emailResult.apiResponse,
        piiFindings: emailResult.piiFindings,
        manualReviewItems: emailResult.manualReviewItems
      }
      await state.set(`workflow:${workflowId}`, workflowState)

      logger.info('Email deletion completed', { 
        workflowId, 
        emailsDeleted: emailResult.apiResponse?.emailsDeleted,
        piiDetected: emailResult.piiFindings?.length || 0,
        manualReview: emailResult.manualReviewItems?.length || 0
      })

      await emit({ topic: 'step-completed', data: { workflowId, stepName, status: 'DELETED', timestamp } })
      await emit({ topic: 'audit-log', data: { event: 'EMAIL_DELETION_COMPLETED', workflowId, stepName, timestamp } })
      
      // Trigger parallel deletions (Intercom, SendGrid, CRM, Analytics)
      await emit({
        topic: 'spawn-parallel-deletions-workflow',
        data: {
          workflowId,
          userIdentifiers,
          systems: ['intercom', 'sendgrid', 'crm', 'analytics']
        }
      })

    } else {
      // Retry logic
      const maxRetries = ghostProtocolConfig.workflow.maxRetryAttempts
      if (attempt < maxRetries) {
        const retryDelay = ghostProtocolConfig.workflow.initialRetryDelay * Math.pow(2, attempt - 1)
        logger.warn('Email deletion failed, retrying', { workflowId, attempt, retryDelay })
        
        setTimeout(async () => {
          await emit({ topic: 'email-deletion', data: { ...data, attempt: attempt + 1 } })
        }, retryDelay)
      } else {
        workflowState.steps[stepName].status = 'FAILED'
        await state.set(`workflow:${workflowId}`, workflowState)
        
        await emit({ topic: 'step-failed', data: { workflowId, stepName, error: emailResult.error, timestamp } })
        await emit({ topic: 'parallel-step-completed', data: { workflowId, stepName, status: 'FAILED', timestamp } })
      }
    }

  } catch (error) {
    logger.error('Email deletion failed', { workflowId, error: error.message })
    await emit({ topic: 'step-failed', data: { workflowId, stepName, error: error.message, timestamp } })
    throw error
  }
}

async function performEmailDeletion(userIdentifiers: any, logger: any, emit: any, workflowId: string) {
  try {
    logger.info('Scanning email content for PII using AI agent', { 
      userId: userIdentifiers.userId,
      emails: userIdentifiers.emails 
    })

    // Simulate fetching user's emails
    const mockEmails = [
      { 
        id: 'email1', 
        subject: 'Account Details', 
        body: `Your account ${userIdentifiers.emails[0]} has been updated. SSN: 123-45-6789`,
        hasAttachment: true,
        attachmentName: 'invoice.pdf'
      },
      { 
        id: 'email2', 
        subject: 'Meeting Notes', 
        body: 'Please review the attached meeting notes from yesterday.',
        hasAttachment: false
      },
      { 
        id: 'email3', 
        subject: 'Personal Info Update', 
        body: `Hi ${userIdentifiers.aliases[0] || 'User'}, please confirm your phone number.`,
        hasAttachment: false
      }
    ]

    const piiFindings = []
    const manualReviewItems = []

    // AI Agent PII Detection
    for (const email of mockEmails) {
      const piiResult = await detectPIIWithAgent(email, userIdentifiers)
      
      if (piiResult.hasPII) {
        if (piiResult.confidence >= 0.8) {
          // High confidence - auto delete
          piiFindings.push({
            emailId: email.id,
            subject: email.subject,
            piiTypes: piiResult.piiTypes,
            confidence: piiResult.confidence,
            action: 'AUTO_DELETE'
          })
        } else if (piiResult.confidence >= 0.5) {
          // Medium confidence - flag for manual review (Req 4.4)
          manualReviewItems.push({
            emailId: email.id,
            subject: email.subject,
            piiTypes: piiResult.piiTypes,
            confidence: piiResult.confidence,
            reason: 'Confidence below threshold for auto-deletion'
          })
        }
      }

      // Check attachments with AI
      if (email.hasAttachment) {
        const attachmentPII = await scanAttachmentForPII(email.attachmentName, userIdentifiers)
        if (attachmentPII.hasPII) {
          piiFindings.push({
            emailId: email.id,
            attachmentName: email.attachmentName,
            piiTypes: attachmentPII.piiTypes,
            confidence: attachmentPII.confidence,
            action: attachmentPII.confidence >= 0.8 ? 'AUTO_DELETE' : 'MANUAL_REVIEW'
          })
        }
      }
    }

    // Emit PII findings for audit (Req 4.5)
    if (piiFindings.length > 0) {
      await emit({
        topic: 'pii-detected',
        data: {
          workflowId,
          source: 'email',
          findings: piiFindings,
          timestamp: new Date().toISOString()
        }
      })
    }

    // Emit manual review required (Req 4.4)
    if (manualReviewItems.length > 0) {
      await emit({
        topic: 'manual-review-required',
        data: {
          workflowId,
          source: 'email',
          items: manualReviewItems,
          timestamp: new Date().toISOString()
        }
      })
    }

    // Simulate deletion
    await new Promise(resolve => setTimeout(resolve, 400))

    const receipt = `email_del_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`
    return {
      success: true,
      receipt,
      apiResponse: {
        emailsDeleted: mockEmails.length,
        attachmentsDeleted: 1,
        piiEmailsFound: piiFindings.length,
        flaggedForReview: manualReviewItems.length,
        systemsProcessed: ['gmail', 'outlook']
      },
      piiFindings,
      manualReviewItems
    }

  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function detectPIIWithAgent(email: any, userIdentifiers: any) {
  // AI Agent simulation - in production, call actual LLM for content analysis
  const text = `${email.subject} ${email.body}`
  const piiTypes: string[] = []
  let maxConfidence = 0

  // Check for various PII types
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const ssnRegex = /\d{3}-\d{2}-\d{4}/g
  const phoneRegex = /\+?[\d\s\-\(\)]{10,}/g
  const creditCardRegex = /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g

  if (emailRegex.test(text)) {
    piiTypes.push('email')
    maxConfidence = Math.max(maxConfidence, 0.95)
  }
  if (ssnRegex.test(text)) {
    piiTypes.push('ssn')
    maxConfidence = Math.max(maxConfidence, 0.99)
  }
  if (phoneRegex.test(text)) {
    piiTypes.push('phone')
    maxConfidence = Math.max(maxConfidence, 0.85)
  }
  if (creditCardRegex.test(text)) {
    piiTypes.push('credit_card')
    maxConfidence = Math.max(maxConfidence, 0.98)
  }

  // Check for user's name/aliases
  const hasName = userIdentifiers.aliases?.some((alias: string) => 
    text.toLowerCase().includes(alias.toLowerCase())
  )
  if (hasName) {
    piiTypes.push('name')
    maxConfidence = Math.max(maxConfidence, 0.7)
  }

  return {
    hasPII: piiTypes.length > 0,
    piiTypes,
    confidence: maxConfidence
  }
}

async function scanAttachmentForPII(attachmentName: string, userIdentifiers: any) {
  // AI Agent for document scanning - simulated
  // In production: OCR + LLM analysis for PDFs, images, etc.
  
  const isPDF = attachmentName.endsWith('.pdf')
  const isImage = /\.(jpg|jpeg|png|gif)$/i.test(attachmentName)

  if (isPDF || isImage) {
    // Simulate AI document analysis
    return {
      hasPII: Math.random() > 0.5,
      piiTypes: ['document_pii'],
      confidence: 0.75
    }
  }

  return { hasPII: false, piiTypes: [], confidence: 0 }
}
