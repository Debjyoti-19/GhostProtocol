import { z } from 'zod'

// Simple error class for this step
class WorkflowStateError extends Error {
  constructor(workflowId: string, message: string) {
    super(`Workflow ${workflowId}: ${message}`)
    this.name = 'WorkflowStateError'
  }
}

// Input schema for Identity Critical Orchestrator event (lenient validation)
const IdentityCriticalOrchestratorInputSchema = z.object({
  workflowId: z.string(),
  userIdentifiers: z.object({
    userId: z.string(),
    emails: z.array(z.string()),
    phones: z.array(z.string()),
    aliases: z.array(z.string())
  })
})

export const config = {
  name: 'IdentityCriticalOrchestrator',
  type: 'event' as const,
  description: 'Orchestrate identity-critical deletion steps with sequential ordering enforcement',
  flows: ['erasure-workflow'],
  subscribes: ['workflow-created'],
  emits: ['stripe-deletion', 'audit-log'],
  input: IdentityCriticalOrchestratorInputSchema
}

export async function handler(data: any, { emit, logger }: any): Promise<void> {
  const timestamp = new Date().toISOString()
  
  logger.info('Orchestrator received data', { data })

  // Parse input
  let workflowId: string
  let userIdentifiers: any
  
  try {
    const parsed = IdentityCriticalOrchestratorInputSchema.parse(data)
    workflowId = parsed.workflowId
    userIdentifiers = parsed.userIdentifiers
  } catch (parseError: any) {
    logger.error('Failed to parse input', { error: parseError.message, data })
    throw new Error(`Input parsing failed: ${parseError.message}`)
  }

  logger.info('Starting identity-critical orchestration', { 
    workflowId, 
    userId: userIdentifiers.userId 
  })

  // Trigger Stripe deletion directly - no state dependency
  logger.info('Triggering Stripe deletion', { workflowId })
  
  await emit({
    topic: 'stripe-deletion',
    data: {
      workflowId,
      userIdentifiers,
      stepName: 'stripe-deletion',
      attempt: 1
    }
  })

  logger.info('Stripe deletion event emitted successfully', { workflowId })

  // Emit audit log
  await emit({
    topic: 'audit-log',
    data: {
      event: 'ORCHESTRATION_STARTED',
      workflowId,
      timestamp
    }
  })
}