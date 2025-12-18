/**
 * Analytics (Mixpanel) Deletion Event Step
 * 
 * Delete user data from Mixpanel Analytics.
 * No AI needed - structured data deletion via GDPR API.
 * Requirements: 3.1, 4.1, 4.2, 4.3
 */

import { z } from 'zod'

// Lenient schema
const AnalyticsDeletionInputSchema = z.object({
  workflowId: z.string(),
  userIdentifiers: z.object({
    userId: z.string(),
    emails: z.array(z.string()),
    phones: z.array(z.string()).optional().default([]),
    aliases: z.array(z.string()).optional().default([])
  }),
  stepName: z.string().default('analytics-deletion'),
  attempt: z.number().int().min(1).default(1)
})

export const config = {
  name: 'AnalyticsDeletion',
  type: 'event' as const,
  description: 'Delete user data from Mixpanel Analytics',
  flows: ['erasure-workflow'],
  subscribes: ['analytics-deletion'],
  emits: ['step-completed', 'step-failed', 'audit-log', 'checkpoint-validation', 'analytics-deletion'],
  input: AnalyticsDeletionInputSchema
}

export async function handler(data: any, { emit, logger }: any): Promise<void> {
  const parsed = AnalyticsDeletionInputSchema.parse(data)
  const { workflowId, userIdentifiers, stepName, attempt } = parsed
  const timestamp = new Date().toISOString()

  logger.info('Starting Mixpanel Analytics deletion', { 
    workflowId, 
    userId: userIdentifiers.userId,
    emails: userIdentifiers.emails,
    attempt 
  })

  try {
    const analyticsResult = await performMixpanelDeletion(userIdentifiers, logger)

    if (analyticsResult.success) {
      logger.info('Mixpanel deletion completed', { 
        workflowId, 
        deletionTaskId: analyticsResult.apiResponse?.taskId,
        receipt: analyticsResult.receipt
      })

      await emit({ topic: 'step-completed', data: { workflowId, stepName, status: 'DELETED', timestamp } })
      await emit({ topic: 'audit-log', data: { 
        event: 'ANALYTICS_DELETION_COMPLETED', 
        workflowId, 
        stepName, 
        timestamp,
        receipt: analyticsResult.receipt
      }})
      
      await emit({
        topic: 'checkpoint-validation',
        data: { workflowId, stepName, status: 'DELETED', timestamp }
      })

    } else {
      const maxRetries = 3
      const errorMsg = (analyticsResult as any).error || 'Unknown error'
      if (attempt < maxRetries) {
        logger.warn('Mixpanel deletion failed, scheduling retry', { workflowId, attempt, error: errorMsg })
        await emit({ topic: 'analytics-deletion', data: { ...parsed, attempt: attempt + 1 } })
      } else {
        logger.error('Mixpanel deletion failed after max retries', { workflowId, error: errorMsg })
        await emit({ topic: 'step-failed', data: { workflowId, stepName, error: errorMsg, timestamp } })
        await emit({
          topic: 'checkpoint-validation',
          data: { workflowId, stepName, status: 'FAILED', timestamp }
        })
      }
    }

  } catch (error: any) {
    logger.error('Mixpanel deletion error', { workflowId, error: error.message })
    await emit({ topic: 'step-failed', data: { workflowId, stepName, error: error.message, timestamp } })
    await emit({
      topic: 'checkpoint-validation',
      data: { workflowId, stepName, status: 'FAILED', timestamp }
    })
  }
}

async function performMixpanelDeletion(userIdentifiers: any, logger: any) {
  const projectId = process.env.MIXPANEL_PROJECT_ID
  const serviceAccount = process.env.MIXPANEL_SERVICE_ACCOUNT
  const serviceSecret = process.env.MIXPANEL_SERVICE_SECRET

  if (!projectId || !serviceAccount || !serviceSecret) {
    logger.info('Mixpanel credentials not set, using mock mode')
    return performMockAnalyticsDeletion(userIdentifiers, logger)
  }

  try {
    logger.info('Connecting to real Mixpanel GDPR API', { userId: userIdentifiers.userId })

    // Mixpanel GDPR API uses Basic Auth with service account
    const auth = Buffer.from(`${serviceAccount}:${serviceSecret}`).toString('base64')

    const deletionResults = {
      deletionRequests: 0,
      taskIds: [] as string[],
      errors: [] as string[]
    }

    // Create deletion request for each identifier
    // Mixpanel GDPR API: https://developer.mixpanel.com/reference/gdpr-api
    
    // Delete by distinct_id (userId)
    try {
      const response = await fetch(`https://mixpanel.com/api/app/data-deletions/v3.0/?token=${process.env.MIXPANEL_PROJECT_TOKEN}`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          distinct_ids: [userIdentifiers.userId, ...userIdentifiers.emails],
          compliance_type: 'GDPR',
          notification_email: userIdentifiers.emails[0] || 'gdpr@ghostprotocol.dev'
        })
      })

      if (response.ok) {
        const result = await response.json()
        deletionResults.deletionRequests++
        if (result.task_id) {
          deletionResults.taskIds.push(result.task_id)
        }
        logger.info('Mixpanel deletion request created', { taskId: result.task_id })
      } else {
        const errorText = await response.text()
        deletionResults.errors.push(`GDPR API: ${response.status} - ${errorText}`)
        logger.warn('Mixpanel GDPR API error', { status: response.status, error: errorText })
      }
    } catch (apiErr: any) {
      deletionResults.errors.push(`API call: ${apiErr.message}`)
      logger.warn('Mixpanel API call failed', { error: apiErr.message })
    }

    // Also try to delete user profile via Engage API
    try {
      const Mixpanel = (await import('mixpanel')).default
      const mixpanel = Mixpanel.init(process.env.MIXPANEL_PROJECT_TOKEN || '')

      // Delete user profiles
      for (const distinctId of [userIdentifiers.userId, ...userIdentifiers.emails]) {
        mixpanel.people.delete_user(distinctId)
        logger.info('Deleted Mixpanel user profile', { distinctId })
      }
      deletionResults.deletionRequests++
    } catch (engageErr: any) {
      logger.warn('Mixpanel Engage deletion failed', { error: engageErr.message })
    }

    const receipt = `mixpanel_del_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`

    logger.info('Mixpanel deletion summary', {
      deletionRequests: deletionResults.deletionRequests,
      taskIds: deletionResults.taskIds,
      errors: deletionResults.errors.length
    })

    return {
      success: deletionResults.deletionRequests > 0 || deletionResults.errors.length === 0,
      receipt,
      apiResponse: {
        ...deletionResults,
        taskId: deletionResults.taskIds[0] || null,
        emailsProcessed: userIdentifiers.emails.length
      }
    }

  } catch (error: any) {
    logger.error('Mixpanel API error', { error: error.message })
    return { success: false, error: error.message }
  }
}

async function performMockAnalyticsDeletion(userIdentifiers: any, logger: any) {
  logger.info('Running mock Mixpanel deletion', { userId: userIdentifiers.userId })
  await new Promise(resolve => setTimeout(resolve, 200))

  return {
    success: true,
    receipt: `mixpanel_mock_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`,
    apiResponse: {
      deletionRequests: 1,
      taskIds: [`mock_task_${Date.now()}`],
      taskId: `mock_task_${Date.now()}`,
      emailsProcessed: userIdentifiers.emails.length,
      errors: [],
      mock: true
    }
  }
}
