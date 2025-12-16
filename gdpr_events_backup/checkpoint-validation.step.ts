import { EventRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { 
  WorkflowStateError 
} from '../errors/index.js'

// Input schema for Checkpoint validation event
const CheckpointValidationInputSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  checkpointType: z.enum(['identity-critical', 'parallel-completion', 'background-jobs']),
  requiredSteps: z.array(z.string().min(1, 'Step name cannot be empty'))
})

// Response schema for Checkpoint validation
const CheckpointValidationResponseSchema = z.object({
  success: z.boolean(),
  checkpointType: z.string(),
  validatedSteps: z.array(z.string()),
  checkpointStatus: z.enum(['PASSED', 'FAILED', 'PENDING']),
  timestamp: z.string().datetime()
})

export const config: EventRouteConfig = {
  name: 'CheckpointValidation',
  type: 'event',
  topic: 'checkpoint-validation',
  description: 'Validate workflow checkpoints and mark completion milestones',
  emits: [
    {
      topic: 'checkpoint-passed',
      label: 'Checkpoint Passed',
      conditional: true
    },
    {
      topic: 'checkpoint-failed',
      label: 'Checkpoint Failed',
      conditional: true
    },
    {
      topic: 'audit-log',
      label: 'Audit Log Entry',
      conditional: false
    },
    {
      topic: 'parallel-deletion-trigger',
      label: 'Trigger Parallel Deletions',
      conditional: true
    }
  ],
  flows: ['erasure-workflow'],
  inputSchema: CheckpointValidationInputSchema,
  outputSchema: CheckpointValidationResponseSchema
}

export const handler: Handlers['CheckpointValidation'] = async (data, { emit, logger, state }) => {
  const { workflowId, checkpointType, requiredSteps } = CheckpointValidationInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Starting checkpoint validation', { 
    workflowId, 
    checkpointType,
    requiredSteps 
  })

  try {
    // Get current workflow state
    const workflowState = await state.get(`workflow:${workflowId}`)
    if (!workflowState) {
      throw new WorkflowStateError(workflowId, `Workflow not found`)
    }

    // Validate all required steps are completed
    const validatedSteps: string[] = []
    const failedSteps: string[] = []

    for (const stepName of requiredSteps) {
      const step = workflowState.steps[stepName]
      
      if (!step) {
        failedSteps.push(`${stepName} (not started)`)
      } else if (step.status === 'DELETED') {
        validatedSteps.push(stepName)
      } else {
        failedSteps.push(`${stepName} (status: ${step.status})`)
      }
    }

    const allStepsCompleted = failedSteps.length === 0
    const checkpointStatus = allStepsCompleted ? 'PASSED' : 'FAILED'

    if (allStepsCompleted) {
      // Mark checkpoint in workflow state
      if (!workflowState.checkpoints) {
        workflowState.checkpoints = {}
      }
      
      workflowState.checkpoints[checkpointType] = {
        status: 'PASSED',
        validatedSteps,
        timestamp
      }

      // Special handling for identity-critical checkpoint
      if (checkpointType === 'identity-critical') {
        workflowState.identityCriticalCompleted = true
        workflowState.identityCriticalCompletedAt = timestamp
      }

      // Save updated state
      await state.set(`workflow:${workflowId}`, workflowState)

      logger.info('Checkpoint validation passed', { 
        workflowId, 
        checkpointType,
        validatedSteps 
      })

      // Emit checkpoint passed
      await emit({
        topic: 'checkpoint-passed',
        data: {
          workflowId,
          checkpointType,
          validatedSteps,
          timestamp
        }
      })

      // Emit audit log
      await emit({
        topic: 'audit-log',
        data: {
          event: 'CHECKPOINT_PASSED',
          workflowId,
          checkpointType,
          validatedSteps,
          timestamp
        }
      })

      // Trigger next phase based on checkpoint type
      if (checkpointType === 'identity-critical') {
        // Identity critical steps completed, trigger parallel deletions
        await emit({
          topic: 'parallel-deletion-trigger',
          data: {
            workflowId,
            userIdentifiers: workflowState.userIdentifiers,
            parallelSteps: ['intercom-deletion', 'sendgrid-deletion', 'crm-deletion', 'analytics-deletion']
          }
        })

        logger.info('Identity critical checkpoint passed, triggering parallel deletions', { 
          workflowId 
        })
      }

      return {
        success: true,
        checkpointType,
        validatedSteps,
        checkpointStatus: 'PASSED',
        timestamp
      }

    } else {
      // Checkpoint failed
      if (!workflowState.checkpoints) {
        workflowState.checkpoints = {}
      }
      
      workflowState.checkpoints[checkpointType] = {
        status: 'FAILED',
        validatedSteps,
        failedSteps,
        timestamp
      }

      // Save updated state
      await state.set(`workflow:${workflowId}`, workflowState)

      logger.error('Checkpoint validation failed', { 
        workflowId, 
        checkpointType,
        validatedSteps,
        failedSteps 
      })

      // Emit checkpoint failed
      await emit({
        topic: 'checkpoint-failed',
        data: {
          workflowId,
          checkpointType,
          validatedSteps,
          failedSteps,
          timestamp,
          requiresManualIntervention: true
        }
      })

      // Emit audit log
      await emit({
        topic: 'audit-log',
        data: {
          event: 'CHECKPOINT_FAILED',
          workflowId,
          checkpointType,
          validatedSteps,
          failedSteps,
          timestamp,
          requiresManualIntervention: true
        }
      })

      return {
        success: false,
        checkpointType,
        validatedSteps,
        checkpointStatus: 'FAILED',
        timestamp
      }
    }

  } catch (error) {
    logger.error('Checkpoint validation failed with exception', { 
      workflowId, 
      checkpointType,
      error: error.message 
    })

    // Emit checkpoint failed
    await emit({
      topic: 'checkpoint-failed',
      data: {
        workflowId,
        checkpointType,
        error: error.message,
        timestamp,
        requiresManualIntervention: true
      }
    })

    throw error
  }
}