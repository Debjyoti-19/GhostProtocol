/**
 * Spawn Parallel Deletions Workflow Event Step
 * 
 * Spawns the parallel deletions child workflow to isolate failures.
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import { z } from 'zod'

const SpawnParallelWorkflowInputSchema = z.object({
  workflowId: z.string().uuid(),
  userIdentifiers: z.object({
    userId: z.string().min(1),
    emails: z.array(z.string().email()),
    phones: z.array(z.string()),
    aliases: z.array(z.string())
  }),
  systems: z.array(z.enum(['intercom', 'sendgrid', 'crm', 'analytics']))
})

export const config = {
  name: 'SpawnParallelWorkflow',
  type: 'event' as const,
  description: 'Spawns parallel deletions child workflow to isolate failures',
  flows: ['erasure-workflow'],
  subscribes: ['spawn-parallel-deletions-workflow'],
  emits: ['intercom-deletion', 'sendgrid-deletion', 'crm-deletion', 'analytics-deletion', 'audit-log'],
  input: SpawnParallelWorkflowInputSchema
}

export async function handler(data: any, { emit, logger, state }: any): Promise<void> {
  const { workflowId, userIdentifiers, systems } = SpawnParallelWorkflowInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Spawning parallel deletions child workflow', {
    workflowId,
    systems
  })

  try {
    // Get current workflow state
    const workflowState = await state.get(`workflow:${workflowId}`)
    if (!workflowState) {
      throw new Error(`Workflow ${workflowId} not found`)
    }

    // Mark the beginning of parallel deletion phase
    workflowState.currentPhase = 'parallel-deletion'
    workflowState.parallelDeletionStartedAt = timestamp
    await state.set(`workflow:${workflowId}`, workflowState)

    // Emit audit log for phase start
    await emit({
      topic: 'audit-log',
      data: {
        event: 'PARALLEL_DELETION_CHILD_WORKFLOW_SPAWNED',
        workflowId,
        userIdentifiers,
        systems,
        timestamp
      }
    })

    // Trigger all parallel deletion steps simultaneously
    // These run as independent event handlers, providing isolation
    const triggeredSteps: string[] = []

    for (const system of systems) {
      const stepData = {
        workflowId,
        userIdentifiers,
        stepName: `${system}-deletion`,
        attempt: 1
      }

      await emit({
        topic: `${system}-deletion`,
        data: stepData
      })
      
      triggeredSteps.push(`${system}-deletion`)
      
      logger.info(`Triggered ${system} deletion`, { workflowId })
    }

    logger.info('All parallel deletion steps triggered', {
      workflowId,
      triggeredSteps
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Failed to spawn parallel deletions workflow', {
      workflowId,
      error: errorMessage
    })

    // Emit audit log for failure
    await emit({
      topic: 'audit-log',
      data: {
        event: 'PARALLEL_DELETION_WORKFLOW_SPAWN_FAILED',
        workflowId,
        error: errorMessage,
        timestamp: new Date().toISOString()
      }
    })

    throw error
  }
}
