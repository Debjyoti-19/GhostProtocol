/**
 * Property-based tests for state update consistency
 * **Feature: gdpr-erasure-system, Property 7: State Update Consistency**
 * **Validates: Requirements 3.2**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fc from 'fast-check'
import { handler as intercomHandler } from './intercom-deletion.step.js'
import { handler as sendgridHandler } from './sendgrid-deletion.step.js'
import { handler as crmHandler } from './crm-deletion.step.js'
import { handler as analyticsHandler } from './analytics-deletion.step.js'

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
const workflowStateArb = fc.record({
  workflowId: fc.uuid(),
  userIdentifiers: userIdentifiersArb,
  status: fc.constant('IN_PROGRESS'),
  identityCriticalCompleted: fc.constant(true),
  currentPhase: fc.constant('parallel-deletion'),
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
  })
})

// Mock successful API responses
const mockSuccessfulApiCall = () => {
  // Mock setTimeout to execute immediately for testing
  vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
    fn()
    return 1 as any
  })
  
  // Mock Math.random to always return success (below failure thresholds)
  // Intercom: 85% success (fail if > 0.15), SendGrid: 90% success (fail if > 0.10)
  // CRM: 80% success (fail if > 0.20), Analytics: 75% success (fail if > 0.25)
  vi.spyOn(Math, 'random').mockReturnValue(0.05) // Always succeed for all systems
}

describe('Property 7: State Update Consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSuccessfulApiCall()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const parallelStepHandlers = [
    { name: 'intercom-deletion', handler: intercomHandler },
    { name: 'sendgrid-deletion', handler: sendgridHandler },
    { name: 'crm-deletion', handler: crmHandler },
    { name: 'analytics-deletion', handler: analyticsHandler }
  ]

  it('should consistently update workflow state with success status and evidence receipts', async () => {
    await fc.assert(fc.asyncProperty(
      workflowStateArb,
      fc.constantFrom(...parallelStepHandlers),
      async (workflowState, stepConfig) => {
        const context = createMockContext()
        const updatedState = { ...workflowState }
        
        context.state.get.mockResolvedValue(updatedState)
        context.state.set.mockImplementation(async (key, state) => {
          Object.assign(updatedState, state)
        })

        const input = {
          workflowId: workflowState.workflowId,
          userIdentifiers: workflowState.userIdentifiers,
          stepName: stepConfig.name,
          attempt: 1
        }

        const result = await stepConfig.handler(input, context)

        // Property: Each parallel deletion step should update workflow state consistently (success or failure)
        expect(result.stepName).toBe(stepConfig.name)
        expect(result.evidence).toBeDefined()
        expect(result.evidence.timestamp).toBeDefined()

        if (result.success) {
          // Success case: verify successful state updates
          expect(result.evidence.receipt).toBeDefined()

          // Verify state was updated with step completion
          expect(context.state.set).toHaveBeenCalledWith(
            `workflow:${workflowState.workflowId}`,
            expect.objectContaining({
              steps: expect.objectContaining({
                [stepConfig.name]: expect.objectContaining({
                  status: 'DELETED',
                  attempts: 1,
                  evidence: expect.objectContaining({
                    receipt: expect.any(String),
                    timestamp: expect.any(String),
                    apiResponse: expect.any(Object)
                  })
                })
              })
            })
          )

          // Verify step-completed event was emitted
          const emitCalls = context.emit.mock.calls
          const stepCompletedEmit = emitCalls.find(call => 
            call[0].topic === 'step-completed'
          )
          expect(stepCompletedEmit).toBeDefined()

        } else {
          // Failure case: verify consistent failure handling
          expect(result.shouldRetry).toBeDefined()
          
          if (result.shouldRetry) {
            // Retry case: step should remain in progress
            expect(result.nextAttempt).toBeGreaterThan(1)
          } else {
            // Final failure: step should be marked as failed
            expect(context.state.set).toHaveBeenCalledWith(
              `workflow:${workflowState.workflowId}`,
              expect.objectContaining({
                steps: expect.objectContaining({
                  [stepConfig.name]: expect.objectContaining({
                    status: 'FAILED',
                    attempts: 1
                  })
                })
              })
            )
          }
        }

        // Verify state updates are consistent regardless of outcome
        expect(context.state.set).toHaveBeenCalled()
      }
    ), { numRuns: 100 })
  })

  it('should maintain state consistency across multiple parallel step completions', async () => {
    await fc.assert(fc.asyncProperty(
      workflowStateArb,
      fc.shuffledSubarray(parallelStepHandlers, { minLength: 2, maxLength: 4 }),
      async (workflowState, selectedSteps) => {
        const context = createMockContext()
        const updatedState = { ...workflowState }
        
        context.state.get.mockResolvedValue(updatedState)
        context.state.set.mockImplementation(async (key, state) => {
          Object.assign(updatedState, state)
        })

        // Execute all selected parallel steps
        const results = []
        for (const stepConfig of selectedSteps) {
          const input = {
            workflowId: workflowState.workflowId,
            userIdentifiers: workflowState.userIdentifiers,
            stepName: stepConfig.name,
            attempt: 1
          }

          const result = await stepConfig.handler(input, context)
          results.push({ stepName: stepConfig.name, result })
        }

        // Property: All parallel steps should maintain consistent state regardless of success/failure
        for (const { stepName, result } of results) {
          expect(result.stepName).toBe(stepName)
          expect(result.evidence).toBeDefined()
          expect(result.evidence.timestamp).toBeDefined()
        }

        // Verify each step was recorded in the workflow state with consistent structure
        const finalSetCall = context.state.set.mock.calls[context.state.set.mock.calls.length - 1]
        const finalState = finalSetCall[1]
        
        for (const stepConfig of selectedSteps) {
          expect(finalState.steps[stepConfig.name]).toMatchObject({
            attempts: 1,
            evidence: expect.objectContaining({
              timestamp: expect.any(String)
            })
          })
          
          // Status should be consistent (DELETED, FAILED, or IN_PROGRESS for retries)
          expect(['DELETED', 'FAILED', 'IN_PROGRESS']).toContain(finalState.steps[stepConfig.name].status)
        }

        // Verify state updates were made for each step
        expect(context.state.set.mock.calls.length).toBeGreaterThanOrEqual(selectedSteps.length)
      }
    ), { numRuns: 50 }) // Reduced runs due to complexity
  })

  it('should handle state updates consistently even when steps complete in different orders', async () => {
    await fc.assert(fc.asyncProperty(
      workflowStateArb,
      fc.array(fc.constantFrom(...parallelStepHandlers), { minLength: 2, maxLength: 4 }).chain(steps => 
        fc.shuffledSubarray(steps, { minLength: steps.length, maxLength: steps.length })
      ),
      async (workflowState, shuffledSteps) => {
        const context = createMockContext()
        const updatedState = { ...workflowState }
        
        context.state.get.mockResolvedValue(updatedState)
        context.state.set.mockImplementation(async (key, state) => {
          Object.assign(updatedState, state)
        })

        // Execute steps in random order
        const completionOrder = []
        for (const stepConfig of shuffledSteps) {
          const input = {
            workflowId: workflowState.workflowId,
            userIdentifiers: workflowState.userIdentifiers,
            stepName: stepConfig.name,
            attempt: 1
          }

          await stepConfig.handler(input, context)
          completionOrder.push(stepConfig.name)
        }

        // Property: Regardless of completion order, all steps should be consistently recorded
        const finalSetCall = context.state.set.mock.calls[context.state.set.mock.calls.length - 1]
        const finalState = finalSetCall[1]
        
        for (const stepConfig of shuffledSteps) {
          expect(finalState.steps[stepConfig.name]).toMatchObject({
            attempts: 1,
            evidence: expect.objectContaining({
              timestamp: expect.any(String)
            })
          })
          
          // Status should be consistent (DELETED, FAILED, or IN_PROGRESS for retries)
          expect(['DELETED', 'FAILED', 'IN_PROGRESS']).toContain(finalState.steps[stepConfig.name].status)
        }

        // Verify state updates were made for each step (at least 2 per step: in-progress + final)
        expect(context.state.set).toHaveBeenCalledTimes(shuffledSteps.length * 2)
      }
    ), { numRuns: 50 })
  })
})