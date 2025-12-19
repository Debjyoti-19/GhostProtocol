import { z } from 'zod'

// Simple error class for this step
class WorkflowStateError extends Error {
  constructor(workflowId: string, message: string) {
    super(`Workflow ${workflowId}: ${message}`)
    this.name = 'WorkflowStateError'
  }
}

// Lenient input schema for Checkpoint validation event
// Accepts both old format (checkpointType/requiredSteps) and new format (stepName/status)
const CheckpointValidationInputSchema = z.object({
  workflowId: z.string(),
  // Old format
  checkpointType: z.enum(['identity-critical', 'parallel-completion', 'background-jobs']).optional(),
  requiredSteps: z.array(z.string()).optional(),
  // New format (from individual steps)
  stepName: z.string().optional(),
  status: z.string().optional(),
  timestamp: z.string().optional()
})

export const config = {
  name: 'CheckpointValidation',
  type: 'event' as const,
  description: 'Validate workflow checkpoints and mark completion milestones',
  flows: ['erasure-workflow'],
  subscribes: ['checkpoint-validation'],
  emits: ['checkpoint-passed', 'checkpoint-failed', 'audit-log', 'workflow-completed'],
  input: CheckpointValidationInputSchema
}

export async function handler(data: any, { emit, logger, state }: any): Promise<any> {
  const parsed = CheckpointValidationInputSchema.parse(data)
  const { workflowId, stepName, status } = parsed
  const timestamp = new Date().toISOString()

  logger.info('Checkpoint validation received', { 
    workflowId, 
    stepName,
    status
  })

  try {
    // Track completed steps in state using correct API: state.set(groupId, key, value)
    // Use workflow-specific groupId to isolate state per workflow
    const groupId = `gdpr-checkpoint-${workflowId}`
    
    // Record this step's completion
    if (stepName) {
      const stepRecord = {
        stepName,
        status,
        completedAt: timestamp,
        workflowId
      }
      await state.set(groupId, stepName, stepRecord)
      logger.info('Recorded step completion', { workflowId, stepName, status })
    }

    // Get all checkpoint records for this workflow
    // state.getGroup returns array of values stored in that group
    const allRecords = await state.getGroup(groupId) || []
    
    logger.info('Retrieved checkpoint records', { 
      workflowId, 
      recordCount: allRecords.length,
      records: allRecords 
    })

    // Build completed/failed lists from records
    const completedSteps: string[] = []
    const failedSteps: string[] = []
    
    for (const record of allRecords) {
      if (!record || !record.stepName) continue
      
      if (record.status === 'DELETED' || record.status === 'COMPLETED') {
        if (!completedSteps.includes(record.stepName)) {
          completedSteps.push(record.stepName)
        }
      } else if (record.status === 'FAILED') {
        if (!failedSteps.includes(record.stepName)) {
          failedSteps.push(record.stepName)
        }
      }
    }

    // Define required parallel steps
    const requiredParallelSteps = ['intercom-deletion', 'crm-deletion', 'analytics-deletion']
    const completedParallel = requiredParallelSteps.filter(s => 
      completedSteps.includes(s) || failedSteps.includes(s)
    )

    logger.info('Checkpoint progress', {
      workflowId,
      completedSteps,
      failedSteps,
      completedParallel: completedParallel.length,
      requiredParallel: requiredParallelSteps.length
    })

    // Check if all parallel steps are done
    if (completedParallel.length >= requiredParallelSteps.length) {
      logger.info('All parallel deletions completed, triggering workflow completion', { workflowId })

      // Note: We don't have access to userIdentifiers here since state is step-scoped
      // The workflow-completed handler should get userIdentifiers from the event data if needed
      
      await emit({
        topic: 'checkpoint-passed',
        data: {
          workflowId,
          checkpointType: 'parallel-completion',
          completedSteps,
          failedSteps,
          timestamp
        }
      })

      // Emit workflow completion
      await emit({
        topic: 'workflow-completed',
        data: {
          workflowId,
          completedSteps,
          failedSteps,
          completedAt: timestamp,
          status: failedSteps.length > 0 ? 'COMPLETED_WITH_EXCEPTIONS' : 'COMPLETED'
        }
      })

      await emit({
        topic: 'audit-log',
        data: {
          event: 'WORKFLOW_CHECKPOINT_PASSED',
          workflowId,
          completedSteps,
          failedSteps,
          timestamp
        }
      })
    }

    return {
      success: true,
      stepName,
      status,
      progress: {
        completed: completedSteps.length,
        failed: failedSteps.length,
        total: requiredParallelSteps.length
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Checkpoint validation failed with exception', { 
      workflowId, 
      stepName,
      error: errorMessage 
    })

    await emit({
      topic: 'checkpoint-failed',
      data: {
        workflowId,
        stepName,
        error: errorMessage,
        timestamp,
        requiresManualIntervention: true
      }
    })

    throw error
  }
}