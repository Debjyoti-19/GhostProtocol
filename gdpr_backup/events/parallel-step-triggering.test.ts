/**
 * Property-based tests for parallel step triggering
 * **Feature: gdpr-erasure-system, Property 6: Parallel Step Triggering**
 * **Validates: Requirements 3.1**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { handler as parallelOrchestratorHandler } from './parallel-deletion-orchestrator.step.js'
import { handler as checkpointHandler } from './checkpoint-validation.step.js'

// Mock Motia context
const createMockContext = () => ({
  emit: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  state: {
    get: vi.fn(),
    set: vi.fn()
  }
})

// Generator for valid user identifiers
const userIdentifiersArb = fc.record({
  userId: fc.uuid(),
  emails: fc.array(fc.string().map(s => `user${Math.abs(s.hashCode ? s.hashCode() : Math.random() * 1000000)}@example.com`), { minLength: 1, maxLength: 3 }),
  phones: fc.array(fc.string().map(s => `+1${Math.floor(Math.random() * 9000000000 + 1000000000)}`), { minLength: 0, maxLength: 2 }),
  aliases: fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), { minLength: 0, maxLength: 3 })
})

// Generator for workflow state with identity-critical completed
const completedWorkflowStateArb = fc.record({
  workflowId: fc.uuid(),
  userIdentifiers: userIdentifiersArb,
  status: fc.constant('IN_PROGRESS'),
  identityCriticalCompleted: fc.constant(true),
  identityCriticalCompletedAt: fc.date().map(d => d.toISOString()),
  currentPhase: fc.constant('identity-critical'),
  steps: fc.record({
    'stripe-deletion': fc.record({
      status: fc.constant('DELETED'),
      attempts: fc.integer({ min: 1, max: 3 }),
      evidence: fc.record({
        receipt: fc.string(),
        timestamp: fc.date().map(d => d.toISOString()),
        apiResponse: fc.anything()
      })
    }),
    'database-deletion': fc.record({
      status: fc.constant('DELETED'),
      attempts: fc.integer({ min: 1, max: 3 }),
      evidence: fc.record({
        receipt: fc.string(),
        timestamp: fc.date().map(d => d.toISOString()),
        apiResponse: fc.anything()
      })
    })
  }),
  checkpoints: fc.record({
    'identity-critical': fc.record({
      status: fc.constant('PASSED'),
      validatedSteps: fc.constant(['stripe-deletion', 'database-deletion']),
      timestamp: fc.date().map(d => d.toISOString())
    })
  })
})

describe('Property 6: Parallel Step Triggering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should only trigger parallel steps after identity-critical checkpoint is completed', async () => {
    await fc.assert(fc.asyncProperty(
      completedWorkflowStateArb,
      fc.array(fc.constantFrom('intercom-deletion', 'sendgrid-deletion', 'crm-deletion', 'analytics-deletion'), { minLength: 1, maxLength: 4 }),
      async (workflowState, parallelSteps) => {
        const context = createMockContext()
        context.state.get.mockResolvedValue(workflowState)
        context.state.set.mockResolvedValue(undefined)

        const input = {
          workflowId: workflowState.workflowId,
          userIdentifiers: workflowState.userIdentifiers,
          parallelSteps
        }

        const result = await parallelOrchestratorHandler(input, context)

        // Property: Parallel steps should only be triggered when identity-critical checkpoint is completed
        expect(result.success).toBe(true)
        expect(result.phase).toBe('parallel-deletion')
        expect(result.triggeredSteps).toEqual(parallelSteps)

        // Verify that emit was called for each parallel step
        const emitCalls = context.emit.mock.calls
        const stepEmits = emitCalls.filter(call => 
          parallelSteps.includes(call[0].topic.replace('-deletion', '-deletion'))
        )
        expect(stepEmits).toHaveLength(parallelSteps.length)

        // Verify workflow state was updated to parallel-deletion phase
        expect(context.state.set).toHaveBeenCalledWith(
          `workflow:${workflowState.workflowId}`,
          expect.objectContaining({
            currentPhase: 'parallel-deletion',
            parallelDeletionStartedAt: expect.any(String)
          })
        )
      }
    ), { numRuns: 100 })
  })

  it('should reject parallel step triggering when identity-critical checkpoint is not completed', async () => {
    await fc.assert(fc.asyncProperty(
      completedWorkflowStateArb.map(state => ({
        ...state,
        identityCriticalCompleted: false,
        checkpoints: {}
      })),
      fc.array(fc.constantFrom('intercom-deletion', 'sendgrid-deletion', 'crm-deletion', 'analytics-deletion'), { minLength: 1, maxLength: 4 }),
      async (workflowState, parallelSteps) => {
        const context = createMockContext()
        context.state.get.mockResolvedValue(workflowState)

        const input = {
          workflowId: workflowState.workflowId,
          userIdentifiers: workflowState.userIdentifiers,
          parallelSteps
        }

        // Property: Should throw error when identity-critical checkpoint not completed
        await expect(parallelOrchestratorHandler(input, context)).rejects.toThrow(
          'Parallel deletions cannot proceed: Identity-critical checkpoint not completed'
        )

        // Verify no parallel steps were triggered
        const emitCalls = context.emit.mock.calls
        const stepEmits = emitCalls.filter(call => 
          parallelSteps.some(step => call[0].topic === step)
        )
        expect(stepEmits).toHaveLength(0)
      }
    ), { numRuns: 100 })
  })

  it('should trigger parallel steps only after checkpoint validation passes', async () => {
    await fc.assert(fc.asyncProperty(
      completedWorkflowStateArb,
      async (workflowState) => {
        const context = createMockContext()
        context.state.get.mockResolvedValue(workflowState)
        context.state.set.mockResolvedValue(undefined)

        const checkpointInput = {
          workflowId: workflowState.workflowId,
          checkpointType: 'identity-critical' as const,
          requiredSteps: ['stripe-deletion', 'database-deletion']
        }

        const checkpointResult = await checkpointHandler(checkpointInput, context)

        // Property: Checkpoint validation should pass and trigger parallel deletions
        expect(checkpointResult.success).toBe(true)
        expect(checkpointResult.checkpointStatus).toBe('PASSED')

        // Verify parallel-deletion-trigger was emitted
        const emitCalls = context.emit.mock.calls
        const parallelTriggerEmit = emitCalls.find(call => 
          call[0].topic === 'parallel-deletion-trigger'
        )
        expect(parallelTriggerEmit).toBeDefined()
        expect(parallelTriggerEmit[0].data.parallelSteps).toEqual([
          'intercom-deletion', 'sendgrid-deletion', 'crm-deletion', 'analytics-deletion'
        ])
      }
    ), { numRuns: 100 })
  })
})