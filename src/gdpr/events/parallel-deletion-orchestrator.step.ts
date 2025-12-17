import { z } from 'zod'

// Simple error class for this step
class WorkflowStateError extends Error {
  constructor(workflowId: string, message: string) {
    super(`Workflow ${workflowId}: ${message}`)
    this.name = 'WorkflowStateError'
  }
}

// Input schema for Parallel Deletion Orchestrator event
const ParallelDeletionOrchestratorInputSchema = z.object({
  workflowId: z.string().uuid(),
  userIdentifiers: z.object({
    userId: z.string().min(1, 'User ID is required'),
    emails: z.array(z.string().email()),
    phones: z.array(z.string().regex(/^\+?[\d\s\-\(\)]+$/)),
    aliases: z.array(z.string().min(1, 'Alias cannot be empty'))
  }),
  parallelSteps: z.array(z.string().min(1, 'Step name cannot be empty'))
})

export const config = {
  name: 'ParallelDeletionOrchestrator',
  type: 'event' as const,
  description: 'Orchestrate parallel deletion steps for non-critical systems after identity-critical checkpoint',
  subscribes: ['parallel-deletion-trigger'],
  emits: [
    {
      topic: 'intercom-deletion',
      label: 'Trigger Intercom Deletion'
    },
    {
      topic: 'sendgrid-deletion',
      label: 'Trigger SendGrid Deletion'
    },
    {
      topic: 'crm-deletion',
      label: 'Trigger CRM Deletion'
    },
    {
      topic: 'analytics-deletion',
      label: 'Trigger Analytics Deletion'
    },
    {
      topic: 'audit-log',
      label: 'Audit Log Entry'
    }
  ],
  input: ParallelDeletionOrchestratorInputSchema
}

export async function handler(data: any, { emit, logger, state }: any): Promise<void> {
  const { workflowId, userIdentifiers, parallelSteps } = ParallelDeletionOrchestratorInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Starting parallel deletion orchestration', { 
    workflowId, 
    userId: userIdentifiers.userId,
    parallelSteps 
  })

  try {
    // Get current workflow state
    const workflowState = await state.get(`workflow:${workflowId}`)
    if (!workflowState) {
      throw new WorkflowStateError(workflowId, `Workflow not found`)
    }

    // Verify identity-critical checkpoint is completed
    if (!workflowState.identityCriticalCompleted) {
      throw new WorkflowStateError(
        workflowId,
        `Parallel deletions cannot proceed: Identity-critical checkpoint not completed`
      )
    }

    // Mark the beginning of parallel deletion phase
    workflowState.currentPhase = 'parallel-deletion'
    workflowState.parallelDeletionStartedAt = timestamp

    // Save updated state
    await state.set(`workflow:${workflowId}`, workflowState)

    logger.info('Parallel deletion phase started, triggering all parallel steps', { 
      workflowId, 
      userId: userIdentifiers.userId,
      parallelSteps 
    })

    // Emit audit log for phase start
    await emit({
      topic: 'audit-log',
      data: {
        event: 'PARALLEL_DELETION_PHASE_STARTED',
        workflowId,
        userIdentifiers,
        phase: 'parallel-deletion',
        parallelSteps,
        timestamp
      }
    })

    // Trigger all parallel deletion steps simultaneously
    const triggeredSteps: string[] = []

    for (const stepName of parallelSteps) {
      const stepData = {
        workflowId,
        userIdentifiers,
        stepName,
        attempt: 1
      }

      switch (stepName) {
        case 'intercom-deletion':
          await emit({
            topic: 'intercom-deletion',
            data: stepData
          })
          triggeredSteps.push('intercom-deletion')
          break

        case 'sendgrid-deletion':
          await emit({
            topic: 'sendgrid-deletion',
            data: stepData
          })
          triggeredSteps.push('sendgrid-deletion')
          break

        case 'crm-deletion':
          await emit({
            topic: 'crm-deletion',
            data: stepData
          })
          triggeredSteps.push('crm-deletion')
          break

        case 'analytics-deletion':
          await emit({
            topic: 'analytics-deletion',
            data: stepData
          })
          triggeredSteps.push('analytics-deletion')
          break

        default:
          logger.warn('Unknown parallel step requested', { 
            workflowId, 
            stepName 
          })
      }
    }

    logger.info('All parallel deletion steps triggered', { 
      workflowId, 
      userId: userIdentifiers.userId,
      triggeredSteps 
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Parallel deletion orchestration failed', { 
      workflowId, 
      userId: userIdentifiers.userId,
      error: errorMessage 
    })

    // Emit audit log for orchestration failure
    await emit({
      topic: 'audit-log',
      data: {
        event: 'PARALLEL_DELETION_ORCHESTRATION_FAILED',
        workflowId,
        userIdentifiers,
        error: errorMessage,
        timestamp: new Date().toISOString()
      }
    })

    throw error
  }
}