import { z } from 'zod'

// Simple error classes for this step
class WorkflowStateError extends Error {
  constructor(workflowId: string, message: string) {
    super(`Workflow ${workflowId}: ${message}`)
    this.name = 'WorkflowStateError'
  }
}

// Configuration constants (inline to avoid import issues)
const ghostProtocolConfig = {
  externalSystems: {
    crm: {
      timeout: 20000,
      maxRetries: 3
    }
  }
}

// Input schema for CRM deletion event
const CRMDeletionInputSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  userIdentifiers: z.object({
    userId: z.string().min(1, 'User ID is required'),
    emails: z.array(z.string().email('Invalid email format')),
    phones: z.array(z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone format')),
    aliases: z.array(z.string().min(1, 'Alias cannot be empty'))
  }),
  stepName: z.string().default('crm-deletion'),
  attempt: z.number().int().min(1, 'Attempt must be positive').default(1)
})

// Response schema for CRM deletion
const CRMDeletionResponseSchema = z.object({
  success: z.boolean(),
  stepName: z.string(),
  evidence: z.object({
    receipt: z.string().optional(),
    timestamp: z.string().datetime(),
    apiResponse: z.any().optional()
  }),
  shouldRetry: z.boolean().default(false),
  nextAttempt: z.number().int().optional()
})

export const config: EventRouteConfig = {
  name: 'CRMDeletion',
  type: 'event',
  topic: 'crm-deletion',
  description: 'Delete customer records from CRM system with retry logic',
  emits: [
    {
      topic: 'step-completed',
      label: 'Step Completed',
      conditional: false
    },
    {
      topic: 'step-failed',
      label: 'Step Failed',
      conditional: true
    },
    {
      topic: 'audit-log',
      label: 'Audit Log Entry',
      conditional: false
    },
    {
      topic: 'parallel-step-completed',
      label: 'Parallel Step Completed',
      conditional: true
    }
  ],
  flows: ['erasure-workflow'],
  inputSchema: CRMDeletionInputSchema,
  outputSchema: CRMDeletionResponseSchema
}

export const handler: Handlers['CRMDeletion'] = async (data, { emit, logger, state }) => {
  const { workflowId, userIdentifiers, stepName, attempt } = CRMDeletionInputSchema.parse(data)
  const timestamp = new Date().toISOString()

  logger.info('Starting CRM deletion', { 
    workflowId, 
    userId: userIdentifiers.userId,
    stepName,
    attempt 
  })

  try {
    // Get current workflow state
    const workflowState = await state.get(`workflow:${workflowId}`)
    if (!workflowState) {
      throw new WorkflowStateError(workflowId, `Workflow not found`)
    }

    // Verify identity-critical checkpoint is completed (parallel step dependency)
    if (!workflowState.identityCriticalCompleted) {
      throw new WorkflowStateError(
        workflowId,
        `CRM deletion cannot proceed: Identity-critical checkpoint not completed`
      )
    }

    // Initialize step state if not exists
    if (!workflowState.steps[stepName]) {
      workflowState.steps[stepName] = {
        status: 'NOT_STARTED',
        attempts: 0,
        evidence: {
          timestamp,
          receipt: undefined,
          apiResponse: undefined
        }
      }
    }

    // Update step to in progress
    workflowState.steps[stepName].status = 'IN_PROGRESS'
    workflowState.steps[stepName].attempts = attempt

    // Save updated state
    await state.set(`workflow:${workflowId}`, workflowState)

    // Perform CRM deletion
    const crmResult = await performCRMDeletion(userIdentifiers, logger)

    if (crmResult.success) {
      // Update step to completed
      workflowState.steps[stepName].status = 'DELETED'
      workflowState.steps[stepName].evidence = {
        receipt: crmResult.receipt,
        timestamp,
        apiResponse: crmResult.apiResponse
      }

      // Save updated state
      await state.set(`workflow:${workflowId}`, workflowState)

      logger.info('CRM deletion completed successfully', { 
        workflowId, 
        userId: userIdentifiers.userId,
        receipt: crmResult.receipt 
      })

      // Emit step completion
      await emit({
        topic: 'step-completed',
        data: {
          workflowId,
          stepName,
          status: 'DELETED',
          evidence: workflowState.steps[stepName].evidence,
          timestamp
        }
      })

      // Emit audit log
      await emit({
        topic: 'audit-log',
        data: {
          event: 'CRM_DELETION_COMPLETED',
          workflowId,
          stepName,
          userIdentifiers,
          evidence: workflowState.steps[stepName].evidence,
          timestamp
        }
      })

      // Emit parallel step completion for checkpoint tracking
      await emit({
        topic: 'parallel-step-completed',
        data: {
          workflowId,
          stepName,
          stepType: 'parallel-deletion',
          timestamp
        }
      })

      return {
        success: true,
        stepName,
        evidence: workflowState.steps[stepName].evidence,
        shouldRetry: false
      }

    } else {
      // Handle failure with retry logic
      const maxRetries = ghostProtocolConfig.workflow.maxRetryAttempts
      const shouldRetry = attempt < maxRetries

      if (shouldRetry) {
        const nextAttempt = attempt + 1
        const retryDelay = ghostProtocolConfig.workflow.initialRetryDelay * 
          Math.pow(ghostProtocolConfig.workflow.retryBackoffMultiplier, attempt - 1)

        logger.warn('CRM deletion failed, will retry', { 
          workflowId, 
          userId: userIdentifiers.userId,
          attempt,
          nextAttempt,
          retryDelay,
          error: crmResult.error 
        })

        // Update step with failure but keep in progress for retry
        workflowState.steps[stepName].evidence = {
          timestamp,
          apiResponse: crmResult.apiResponse
        }
        await state.set(`workflow:${workflowId}`, workflowState)

        // Schedule retry with exponential backoff
        setTimeout(async () => {
          await emit({
            topic: 'crm-deletion',
            data: {
              workflowId,
              userIdentifiers,
              stepName,
              attempt: nextAttempt
            }
          })
        }, retryDelay)

        return {
          success: false,
          stepName,
          evidence: workflowState.steps[stepName].evidence,
          shouldRetry: true,
          nextAttempt
        }

      } else {
        // Max retries exceeded, mark as failed
        workflowState.steps[stepName].status = 'FAILED'
        workflowState.steps[stepName].evidence = {
          timestamp,
          apiResponse: crmResult.apiResponse
        }
        await state.set(`workflow:${workflowId}`, workflowState)

        logger.error('CRM deletion failed after max retries', { 
          workflowId, 
          userId: userIdentifiers.userId,
          maxRetries,
          error: crmResult.error 
        })

        // Emit step failure
        await emit({
          topic: 'step-failed',
          data: {
            workflowId,
            stepName,
            status: 'FAILED',
            error: crmResult.error,
            evidence: workflowState.steps[stepName].evidence,
            timestamp,
            requiresManualIntervention: false // Non-critical system
          }
        })

        // Emit audit log
        await emit({
          topic: 'audit-log',
          data: {
            event: 'CRM_DELETION_FAILED',
            workflowId,
            stepName,
            userIdentifiers,
            error: crmResult.error,
            evidence: workflowState.steps[stepName].evidence,
            timestamp,
            requiresManualIntervention: false
          }
        })

        // Still emit parallel step completion (with failure status) for checkpoint tracking
        await emit({
          topic: 'parallel-step-completed',
          data: {
            workflowId,
            stepName,
            stepType: 'parallel-deletion',
            status: 'FAILED',
            timestamp
          }
        })

        return {
          success: false,
          stepName,
          evidence: workflowState.steps[stepName].evidence,
          shouldRetry: false
        }
      }
    }

  } catch (error) {
    logger.error('CRM deletion step failed with exception', { 
      workflowId, 
      userId: userIdentifiers.userId,
      error: error.message 
    })

    // Emit step failure
    await emit({
      topic: 'step-failed',
      data: {
        workflowId,
        stepName,
        status: 'FAILED',
        error: error.message,
        timestamp,
        requiresManualIntervention: false
      }
    })

    throw error
  }
}

/**
 * Perform actual CRM deletion (mock implementation for now)
 * In production, this would integrate with the real CRM API (Salesforce, HubSpot, etc.)
 */
async function performCRMDeletion(
  userIdentifiers: any, 
  logger: any
): Promise<{
  success: boolean
  receipt?: string
  apiResponse?: any
  error?: string
}> {
  try {
    logger.info('Calling CRM API to delete customer records', { 
      userId: userIdentifiers.userId,
      emails: userIdentifiers.emails 
    })

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 300))

    // Mock successful response (80% success rate for testing)
    const isSuccess = Math.random() > 0.20

    if (isSuccess) {
      const receipt = `crm_del_${Date.now()}_${userIdentifiers.userId.slice(0, 8)}`
      return {
        success: true,
        receipt,
        apiResponse: {
          user_id: userIdentifiers.userId,
          deleted_contacts: 1,
          deleted_opportunities: Math.floor(Math.random() * 3),
          deleted_activities: Math.floor(Math.random() * 15) + 5,
          deleted_notes: Math.floor(Math.random() * 8),
          archived_deals: Math.floor(Math.random() * 2),
          timestamp: new Date().toISOString()
        }
      }
    } else {
      return {
        success: false,
        error: 'CRM API returned error: Contact has active deals',
        apiResponse: {
          error: {
            type: 'business_rule_violation',
            message: 'Cannot delete contact with active deals',
            code: 'active_deals_exist'
          }
        }
      }
    }

  } catch (error) {
    logger.error('CRM API call failed', { error: error.message })
    return {
      success: false,
      error: `CRM API exception: ${error.message}`,
      apiResponse: { exception: error.message }
    }
  }
}