/**
 * Spawn Parallel Deletions Workflow Event Step
 * 
 * Spawns the parallel deletions child workflow to isolate failures.
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import { z } from 'zod'

// Lenient schema to avoid validation issues
const SpawnParallelWorkflowInputSchema = z.object({
  workflowId: z.string(),
  userIdentifiers: z.object({
    userId: z.string(),
    emails: z.array(z.string()),
    phones: z.array(z.string()).optional().default([]),
    aliases: z.array(z.string()).optional().default([])
  }),
  systems: z.array(z.string()).optional().default(['intercom', 'crm', 'analytics'])
})

export const config = {
  name: 'SpawnParallelWorkflow',
  type: 'event' as const,
  description: 'Spawns parallel deletions child workflow to isolate failures',
  flows: ['erasure-workflow'],
  subscribes: ['spawn-parallel-deletions-workflow'],
  emits: ['intercom-deletion', 'crm-deletion', 'analytics-deletion', 'audit-log'],
  input: SpawnParallelWorkflowInputSchema
}

export async function handler(data: any, { emit, logger }: any): Promise<void> {
  const { workflowId, userIdentifiers, systems } = SpawnParallelWorkflowInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Spawning parallel deletions child workflow', {
    workflowId,
    systems
  })

  // NOTE: Don't depend on shared state - Motia state is step-scoped
  // Just emit to parallel deletion steps directly

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
    const topic = `${system}-deletion`
    const stepData = {
      workflowId,
      userIdentifiers,
      stepName: topic,
      attempt: 1
    }

    await emit({
      topic,
      data: stepData
    })
    
    triggeredSteps.push(topic)
    
    logger.info(`Triggered ${system} deletion`, { workflowId, topic })
  }

  logger.info('All parallel deletion steps triggered', {
    workflowId,
    triggeredSteps
  })
}
