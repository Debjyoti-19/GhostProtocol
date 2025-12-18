/**
 * Workflow Completion Event Step
 * 
 * Handles workflow completion events and schedules zombie data checks.
 * This step is triggered when an erasure workflow completes successfully.
 * 
 * Requirements: 8.1
 */

import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

// Default zombie check interval (30 days in days)
const DEFAULT_ZOMBIE_CHECK_INTERVAL = 30

// Input schema for workflow completion
const WorkflowCompletionInputSchema = z.object({
  workflowId: z.string().uuid(),
  userIdentifiers: z.object({
    userId: z.string(),
    emails: z.array(z.string()),
    phones: z.array(z.string()),
    aliases: z.array(z.string())
  }),
  completedAt: z.string().datetime(),
  status: z.enum(['COMPLETED', 'COMPLETED_WITH_EXCEPTIONS']),
  jurisdiction: z.enum(['EU', 'US', 'OTHER']).optional(),
  zombieCheckInterval: z.number().int().min(1).optional()
})

export const config = {
  name: 'WorkflowCompletion',
  type: 'event' as const,
  description: 'Handles workflow completion and schedules zombie data checks',
  subscribes: ['workflow-completed'],
  emits: [
    {
      topic: 'zombie-check-scheduled',
      label: 'Zombie Check Scheduled'
    },
    {
      topic: 'audit-log',
      label: 'Audit Log Entry'
    }
  ],
  input: WorkflowCompletionInputSchema
}

export async function handler(data: any, { emit, logger, state }: any): Promise<void> {
  const { workflowId, userIdentifiers, completedAt, status, jurisdiction, zombieCheckInterval } = 
    WorkflowCompletionInputSchema.parse(data)

  logger.info('Processing workflow completion', { 
    workflowId, 
    status,
    completedAt 
  })

  try {
    // Schedule zombie data check (Requirement 8.1)
    const scheduleId = uuidv4()
    const interval = zombieCheckInterval || DEFAULT_ZOMBIE_CHECK_INTERVAL
    
    // Calculate scheduled date (default 30 days after completion)
    const completedDate = new Date(completedAt)
    const scheduledDate = new Date(completedDate.getTime() + interval * 24 * 60 * 60 * 1000)
    const scheduledFor = scheduledDate.toISOString()
    const createdAt = new Date().toISOString()

    const systemsToCheck = [
      'stripe',
      'database',
      'intercom',
      'sendgrid',
      'crm',
      'analytics'
    ]

    const schedule = {
      scheduleId,
      workflowId,
      userIdentifiers,
      scheduledFor,
      createdAt,
      status: 'SCHEDULED',
      zombieCheckInterval: interval,
      systemsToCheck,
      jurisdiction
    }

    // Store the schedule
    await state.set('zombie_check_schedules', scheduleId, schedule)
    
    // Also index by workflow ID for easy lookup
    await state.set('zombie_checks_by_workflow', workflowId, scheduleId)

    logger.info('Zombie check scheduled for completed workflow', {
      workflowId,
      scheduleId,
      scheduledFor,
      zombieCheckInterval: interval
    })

    // Emit zombie check scheduled event
    await emit({
      topic: 'zombie-check-scheduled',
      data: {
        workflowId,
        scheduleId,
        scheduledFor,
        zombieCheckInterval: interval,
        userIdentifiers,
        systemsToCheck
      }
    })

    // Emit audit log
    await emit({
      topic: 'audit-log',
      data: {
        event: 'ZOMBIE_CHECK_SCHEDULED',
        workflowId,
        scheduleId,
        scheduledFor,
        zombieCheckInterval: interval,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Error scheduling zombie check', { 
      workflowId, 
      error: errorMessage 
    })

    // Emit audit log for failure
    await emit({
      topic: 'audit-log',
      data: {
        event: 'ZOMBIE_CHECK_SCHEDULING_FAILED',
        workflowId,
        error: errorMessage,
        timestamp: new Date().toISOString()
      }
    })

    throw error
  }
}
