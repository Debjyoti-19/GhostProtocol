import { z } from 'zod'

// Simple error class for this step
class WorkflowStateError extends Error {
  constructor(workflowId: string, message: string) {
    super(`Workflow ${workflowId}: ${message}`)
    this.name = 'WorkflowStateError'
  }
}

// Input schema for Identity Critical Orchestrator event
const IdentityCriticalOrchestratorInputSchema = z.object({
  workflowId: z.string().uuid(),
  userIdentifiers: z.object({
    userId: z.string().min(1, 'User ID is required'),
    emails: z.array(z.string().email()),
    phones: z.array(z.string().regex(/^\+?[\d\s\-\(\)]+$/)),
    aliases: z.array(z.string().min(1, 'Alias cannot be empty'))
  })
})

export const config = {
  name: 'IdentityCriticalOrchestrator',
  type: 'event' as const,
  description: 'Orchestrate identity-critical deletion steps with sequential ordering enforcement',
  subscribes: ['workflow-created'],
  emits: [
    {
      topic: 'stripe-deletion',
      label: 'Trigger Stripe Deletion'
    },
    {
      topic: 'audit-log',
      label: 'Audit Log Entry'
    }
  ],
  input: IdentityCriticalOrchestratorInputSchema
}

export async function handler(data: any, { emit, logger, state }: any): Promise<void> {
  const { workflowId, userIdentifiers } = IdentityCriticalOrchestratorInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Starting identity-critical orchestration', { 
    workflowId, 
    userId: userIdentifiers.userId 
  })

  try {
    // Get current workflow state
    const workflowState = await state.get(`workflow:${workflowId}`)
    if (!workflowState) {
      throw new WorkflowStateError(workflowId, `Workflow not found`)
    }

    // Ensure workflow is in correct state to begin identity-critical phase
    if (workflowState.status !== 'IN_PROGRESS') {
      throw new WorkflowStateError(
        workflowId,
        `Workflow is not in progress. Current status: ${workflowState.status}`
      )
    }

    // Mark the beginning of identity-critical phase
    workflowState.currentPhase = 'identity-critical'
    workflowState.identityCriticalStartedAt = timestamp

    // Save updated state
    await state.set(`workflow:${workflowId}`, workflowState)

    logger.info('Identity-critical phase started, triggering Stripe deletion', { 
      workflowId, 
      userId: userIdentifiers.userId 
    })

    // Emit audit log for phase start
    await emit({
      topic: 'audit-log',
      data: {
        event: 'IDENTITY_CRITICAL_PHASE_STARTED',
        workflowId,
        userIdentifiers,
        phase: 'identity-critical',
        timestamp
      }
    })

    // Trigger the first step in the sequential chain: Stripe deletion
    // Database deletion will be triggered automatically after Stripe completes
    await emit({
      topic: 'stripe-deletion',
      data: {
        workflowId,
        userIdentifiers,
        stepName: 'stripe-deletion',
        attempt: 1
      }
    })

    return {
      success: true,
      workflowId,
      phase: 'identity-critical',
      triggeredSteps: ['stripe-deletion'],
      timestamp
    }

  } catch (error) {
    logger.error('Identity-critical orchestration failed', { 
      workflowId, 
      userId: userIdentifiers.userId,
      error: error.message 
    })

    // Emit audit log for orchestration failure
    await emit({
      topic: 'audit-log',
      data: {
        event: 'IDENTITY_CRITICAL_ORCHESTRATION_FAILED',
        workflowId,
        userIdentifiers,
        error: error.message,
        timestamp
      }
    })

    throw error
  }
}