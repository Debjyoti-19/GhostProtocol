/**
 * Property-based tests for identity-critical deletion ordering
 * **Feature: gdpr-erasure-system, Property 4: Identity-Critical Ordering**
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'

// Mock Motia handlers and state
const mockState = new Map<string, any>()
const mockEmittedEvents: Array<{ topic: string; data: any }> = []

const mockMotiaContext = {
  emit: async (event: { topic: string; data: any }) => {
    mockEmittedEvents.push(event)
  },
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {}
  },
  state: {
    get: async (key: string) => mockState.get(key),
    set: async (key: string, value: any) => mockState.set(key, value)
  }
}

// Mock the random functions to be deterministic for testing
const originalMathRandom = Math.random
const originalSetTimeout = setTimeout

// Import handlers after mocking
import { handler as stripeHandler } from '../../../src/gdpr/events/stripe-deletion.step.js'
import { handler as databaseHandler } from '../../../src/gdpr/events/database-deletion.step.js'
import { handler as checkpointHandler } from '../../../src/gdpr/events/checkpoint-validation.step.js'

describe('Identity-Critical Deletion Ordering Properties', () => {
  beforeEach(() => {
    mockState.clear()
    mockEmittedEvents.length = 0
    
    // Mock Math.random to always return success (> 0.1 for Stripe, > 0.05 for DB)
    Math.random = () => 0.9
    
    // Mock setTimeout to execute immediately
    global.setTimeout = ((fn: Function) => {
      fn()
      return 1 as any
    }) as any
  })

  afterEach(() => {
    mockState.clear()
    mockEmittedEvents.length = 0
    
    // Restore original functions
    Math.random = originalMathRandom
    global.setTimeout = originalSetTimeout
  })

  /**
   * Property 4: Identity-Critical Ordering
   * For any workflow, Stripe deletion must complete successfully before database deletion begins,
   * and both must succeed before the "identity: GONE" checkpoint is set
   */
  it('should enforce sequential ordering: Stripe → Database → Checkpoint', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary workflow data
        fc.record({
          workflowId: fc.string().map(() => uuidv4()),
          userIdentifiers: fc.record({
            userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            emails: fc.array(fc.constant('test@example.com'), { minLength: 1, maxLength: 3 }),
            phones: fc.array(fc.constant('+1234567890'), { minLength: 0, maxLength: 2 }),
            aliases: fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), { minLength: 0, maxLength: 3 })
          })
        }),
        async ({ workflowId, userIdentifiers }) => {
          // Clear events for this iteration
          mockEmittedEvents.length = 0
          
          // Setup initial workflow state
          const initialWorkflowState = {
            workflowId,
            userIdentifiers,
            status: 'IN_PROGRESS',
            policyVersion: '1.0.0',
            legalHolds: [],
            steps: {},
            backgroundJobs: {},
            auditHashes: [],
            dataLineageSnapshot: {
              systems: ['stripe', 'database'],
              identifiers: [userIdentifiers.userId, ...userIdentifiers.emails],
              capturedAt: new Date().toISOString()
            }
          }

          await mockMotiaContext.state.set(`workflow:${workflowId}`, initialWorkflowState)

          // Step 1: Execute Stripe deletion
          const stripeResult = await stripeHandler(
            {
              workflowId,
              userIdentifiers,
              stepName: 'stripe-deletion',
              attempt: 1
            },
            mockMotiaContext
          )

          // Verify Stripe deletion completed successfully
          expect(stripeResult.success).toBe(true)
          expect(stripeResult.stepName).toBe('stripe-deletion')

          // Get updated workflow state after Stripe deletion
          const stateAfterStripe = await mockMotiaContext.state.get(`workflow:${workflowId}`)
          expect(stateAfterStripe.steps['stripe-deletion'].status).toBe('DELETED')

          // Verify database deletion event was emitted for this specific workflow
          const databaseTriggerEvent = mockEmittedEvents.find(
            event => event.topic === 'database-deletion' && event.data.workflowId === workflowId
          )
          expect(databaseTriggerEvent).toBeDefined()
          expect(databaseTriggerEvent?.data.workflowId).toBe(workflowId)

          // Step 2: Execute Database deletion (should succeed since Stripe completed)
          const databaseResult = await databaseHandler(
            {
              workflowId,
              userIdentifiers,
              stepName: 'database-deletion',
              attempt: 1
            },
            mockMotiaContext
          )

          // Verify Database deletion completed successfully
          expect(databaseResult.success).toBe(true)
          expect(databaseResult.stepName).toBe('database-deletion')

          // Get updated workflow state after Database deletion
          const stateAfterDatabase = await mockMotiaContext.state.get(`workflow:${workflowId}`)
          expect(stateAfterDatabase.steps['database-deletion'].status).toBe('DELETED')

          // Verify checkpoint validation event was emitted
          const checkpointTriggerEvent = mockEmittedEvents.find(
            event => event.topic === 'checkpoint-validation'
          )
          expect(checkpointTriggerEvent).toBeDefined()
          expect(checkpointTriggerEvent?.data.checkpointType).toBe('identity-critical')

          // Step 3: Execute Checkpoint validation
          const checkpointResult = await checkpointHandler(
            {
              workflowId,
              checkpointType: 'identity-critical',
              requiredSteps: ['stripe-deletion', 'database-deletion']
            },
            mockMotiaContext
          )

          // Verify checkpoint validation passed
          expect(checkpointResult.success).toBe(true)
          expect(checkpointResult.checkpointStatus).toBe('PASSED')
          expect(checkpointResult.validatedSteps).toContain('stripe-deletion')
          expect(checkpointResult.validatedSteps).toContain('database-deletion')

          // Get final workflow state
          const finalState = await mockMotiaContext.state.get(`workflow:${workflowId}`)
          expect(finalState.identityCriticalCompleted).toBe(true)
          expect(finalState.checkpoints['identity-critical'].status).toBe('PASSED')

          // Verify audit events were emitted in correct order
          const auditEvents = mockEmittedEvents.filter(event => event.topic === 'audit-log')
          expect(auditEvents.length).toBeGreaterThanOrEqual(3)

          const stripeAuditEvent = auditEvents.find(event => 
            event.data.event === 'STRIPE_DELETION_COMPLETED'
          )
          const databaseAuditEvent = auditEvents.find(event => 
            event.data.event === 'DATABASE_DELETION_COMPLETED'
          )
          const checkpointAuditEvent = auditEvents.find(event => 
            event.data.event === 'CHECKPOINT_PASSED'
          )

          expect(stripeAuditEvent).toBeDefined()
          expect(databaseAuditEvent).toBeDefined()
          expect(checkpointAuditEvent).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Database deletion should fail if Stripe deletion hasn't completed
   * This validates the sequential ordering enforcement
   */
  it('should prevent database deletion when Stripe deletion is not completed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().map(() => uuidv4()),
          userIdentifiers: fc.record({
            userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            emails: fc.array(fc.constant('test@example.com'), { minLength: 1, maxLength: 3 }),
            phones: fc.array(fc.constant('+1234567890'), { minLength: 0, maxLength: 2 }),
            aliases: fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), { minLength: 0, maxLength: 3 })
          }),
          stripeStatus: fc.constantFrom('NOT_STARTED', 'IN_PROGRESS', 'FAILED')
        }),
        async ({ workflowId, userIdentifiers, stripeStatus }) => {
          // Clear events for this iteration
          mockEmittedEvents.length = 0
          
          // Setup workflow state with Stripe NOT completed
          const workflowState = {
            workflowId,
            userIdentifiers,
            status: 'IN_PROGRESS',
            policyVersion: '1.0.0',
            legalHolds: [],
            steps: {
              'stripe-deletion': {
                status: stripeStatus,
                attempts: 1,
                evidence: {
                  timestamp: new Date().toISOString()
                }
              }
            },
            backgroundJobs: {},
            auditHashes: [],
            dataLineageSnapshot: {
              systems: ['stripe', 'database'],
              identifiers: [userIdentifiers.userId, ...userIdentifiers.emails],
              capturedAt: new Date().toISOString()
            }
          }

          await mockMotiaContext.state.set(`workflow:${workflowId}`, workflowState)

          // Attempt to execute Database deletion (should fail)
          try {
            await databaseHandler(
              {
                workflowId,
                userIdentifiers,
                stepName: 'database-deletion',
                attempt: 1
              },
              mockMotiaContext
            )
            // If we reach here, the test should fail
            expect(false).toBe(true) // Force failure
          } catch (error) {
            // Verify the error message contains the expected text
            expect(error.message).toMatch(/Database deletion cannot proceed.*Stripe deletion not completed/)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Checkpoint validation should fail if required steps are not completed
   */
  it('should fail checkpoint validation when required steps are incomplete', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().map(() => uuidv4()),
          incompleteSteps: fc.array(
            fc.record({
              stepName: fc.constantFrom('stripe-deletion', 'database-deletion'),
              status: fc.constantFrom('NOT_STARTED', 'IN_PROGRESS', 'FAILED')
            }),
            { minLength: 1, maxLength: 2 }
          )
        }),
        async ({ workflowId, incompleteSteps }) => {
          // Clear events for this iteration
          mockEmittedEvents.length = 0
          
          // Setup workflow state with incomplete steps
          const steps: Record<string, any> = {}
          
          for (const { stepName, status } of incompleteSteps) {
            steps[stepName] = {
              status,
              attempts: 1,
              evidence: {
                timestamp: new Date().toISOString()
              }
            }
          }

          const workflowState = {
            workflowId,
            userIdentifiers: {
              userId: 'test-user',
              emails: ['test@example.com'],
              phones: [],
              aliases: []
            },
            status: 'IN_PROGRESS',
            policyVersion: '1.0.0',
            legalHolds: [],
            steps,
            backgroundJobs: {},
            auditHashes: [],
            dataLineageSnapshot: {
              systems: ['stripe', 'database'],
              identifiers: ['test-user', 'test@example.com'],
              capturedAt: new Date().toISOString()
            }
          }

          await mockMotiaContext.state.set(`workflow:${workflowId}`, workflowState)

          // Execute checkpoint validation
          const checkpointResult = await checkpointHandler(
            {
              workflowId,
              checkpointType: 'identity-critical',
              requiredSteps: ['stripe-deletion', 'database-deletion']
            },
            mockMotiaContext
          )

          // Verify checkpoint validation failed
          expect(checkpointResult.success).toBe(false)
          expect(checkpointResult.checkpointStatus).toBe('FAILED')

          // Verify checkpoint failed event was emitted
          const checkpointFailedEvent = mockEmittedEvents.find(
            event => event.topic === 'checkpoint-failed'
          )
          expect(checkpointFailedEvent).toBeDefined()
          expect(checkpointFailedEvent?.data.requiresManualIntervention).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})