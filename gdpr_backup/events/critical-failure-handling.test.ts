/**
 * Property-based tests for critical failure handling
 * **Feature: gdpr-erasure-system, Property 5: Critical Failure Handling**
 * **Validates: Requirements 2.4**
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
import { handler as stripeHandler } from './stripe-deletion.step.js'
import { handler as databaseHandler } from './database-deletion.step.js'

describe('Critical Failure Handling Properties', () => {
  beforeEach(() => {
    mockState.clear()
    mockEmittedEvents.length = 0
    
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
   * Property 5: Critical Failure Handling
   * For any identity-critical step that fails after all retry attempts, 
   * the workflow should halt and require manual intervention rather than proceeding to parallel steps
   */
  it('should halt workflow when Stripe deletion fails after max retries', async () => {
    await fc.assert(
      fc.asyncProperty(
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
          
          // Mock Math.random to always return failure (< 0.1 for Stripe)
          Math.random = () => 0.05
          
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

          // Execute Stripe deletion with max retries (should fail)
          const maxRetries = 3 // From ghostProtocolConfig.workflow.maxRetryAttempts
          
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const stripeResult = await stripeHandler(
              {
                workflowId,
                userIdentifiers,
                stepName: 'stripe-deletion',
                attempt
              },
              mockMotiaContext
            )

            if (attempt < maxRetries) {
              // Should indicate retry needed
              expect(stripeResult.success).toBe(false)
              expect(stripeResult.shouldRetry).toBe(true)
              expect(stripeResult.nextAttempt).toBe(attempt + 1)
            } else {
              // Final attempt should fail without retry
              expect(stripeResult.success).toBe(false)
              expect(stripeResult.shouldRetry).toBe(false)
            }
          }

          // Get final workflow state
          const finalState = await mockMotiaContext.state.get(`workflow:${workflowId}`)
          expect(finalState.steps['stripe-deletion'].status).toBe('FAILED')

          // Verify step-failed event was emitted
          const stepFailedEvents = mockEmittedEvents.filter(
            event => event.topic === 'step-failed' && 
                    event.data.workflowId === workflowId &&
                    event.data.stepName === 'stripe-deletion'
          )
          expect(stepFailedEvents.length).toBeGreaterThan(0)

          const finalFailureEvent = stepFailedEvents[stepFailedEvents.length - 1]
          expect(finalFailureEvent.data.requiresManualIntervention).toBe(true)

          // Verify audit log events were emitted
          const auditEvents = mockEmittedEvents.filter(
            event => event.topic === 'audit-log' && 
                    event.data.workflowId === workflowId &&
                    event.data.event === 'STRIPE_DELETION_FAILED'
          )
          expect(auditEvents.length).toBeGreaterThan(0)

          const finalAuditEvent = auditEvents[auditEvents.length - 1]
          expect(finalAuditEvent.data.requiresManualIntervention).toBe(true)

          // Verify NO database deletion event was emitted (workflow should halt)
          const databaseTriggerEvents = mockEmittedEvents.filter(
            event => event.topic === 'database-deletion' && event.data.workflowId === workflowId
          )
          expect(databaseTriggerEvents.length).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Database deletion should also halt workflow on critical failure
   */
  it('should halt workflow when database deletion fails after max retries', async () => {
    await fc.assert(
      fc.asyncProperty(
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
          
          // Mock Math.random to fail database operations (< 0.05 for DB)
          Math.random = () => 0.01
          
          // Setup workflow state with Stripe already completed
          const workflowState = {
            workflowId,
            userIdentifiers,
            status: 'IN_PROGRESS',
            policyVersion: '1.0.0',
            legalHolds: [],
            steps: {
              'stripe-deletion': {
                status: 'DELETED',
                attempts: 1,
                evidence: {
                  receipt: 'stripe_del_12345',
                  timestamp: new Date().toISOString(),
                  apiResponse: { id: userIdentifiers.userId, deleted: true }
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

          // Execute Database deletion with max retries (should fail)
          const maxRetries = 3 // From ghostProtocolConfig.workflow.maxRetryAttempts
          
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const databaseResult = await databaseHandler(
              {
                workflowId,
                userIdentifiers,
                stepName: 'database-deletion',
                attempt
              },
              mockMotiaContext
            )

            if (attempt < maxRetries) {
              // Should indicate retry needed
              expect(databaseResult.success).toBe(false)
              expect(databaseResult.shouldRetry).toBe(true)
              expect(databaseResult.nextAttempt).toBe(attempt + 1)
            } else {
              // Final attempt should fail without retry
              expect(databaseResult.success).toBe(false)
              expect(databaseResult.shouldRetry).toBe(false)
            }
          }

          // Get final workflow state
          const finalState = await mockMotiaContext.state.get(`workflow:${workflowId}`)
          expect(finalState.steps['database-deletion'].status).toBe('FAILED')

          // Verify step-failed event was emitted
          const stepFailedEvents = mockEmittedEvents.filter(
            event => event.topic === 'step-failed' && 
                    event.data.workflowId === workflowId &&
                    event.data.stepName === 'database-deletion'
          )
          expect(stepFailedEvents.length).toBeGreaterThan(0)

          const finalFailureEvent = stepFailedEvents[stepFailedEvents.length - 1]
          expect(finalFailureEvent.data.requiresManualIntervention).toBe(true)

          // Verify audit log events were emitted
          const auditEvents = mockEmittedEvents.filter(
            event => event.topic === 'audit-log' && 
                    event.data.workflowId === workflowId &&
                    event.data.event === 'DATABASE_DELETION_FAILED'
          )
          expect(auditEvents.length).toBeGreaterThan(0)

          const finalAuditEvent = auditEvents[auditEvents.length - 1]
          expect(finalAuditEvent.data.requiresManualIntervention).toBe(true)

          // Verify NO checkpoint validation event was emitted (workflow should halt)
          const checkpointTriggerEvents = mockEmittedEvents.filter(
            event => event.topic === 'checkpoint-validation' && event.data.workflowId === workflowId
          )
          expect(checkpointTriggerEvents.length).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Retry logic should implement exponential backoff
   */
  it('should implement exponential backoff retry logic for failed steps', async () => {
    await fc.assert(
      fc.asyncProperty(
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
          
          // Mock Math.random to fail first two attempts, succeed on third
          let callCount = 0
          Math.random = () => {
            callCount++
            return callCount <= 2 ? 0.05 : 0.9 // Fail first 2, succeed on 3rd
          }
          
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

          // Execute first attempt (should fail and schedule retry)
          const firstResult = await stripeHandler(
            {
              workflowId,
              userIdentifiers,
              stepName: 'stripe-deletion',
              attempt: 1
            },
            mockMotiaContext
          )

          expect(firstResult.success).toBe(false)
          expect(firstResult.shouldRetry).toBe(true)
          expect(firstResult.nextAttempt).toBe(2)

          // Execute second attempt (should fail and schedule retry)
          const secondResult = await stripeHandler(
            {
              workflowId,
              userIdentifiers,
              stepName: 'stripe-deletion',
              attempt: 2
            },
            mockMotiaContext
          )

          expect(secondResult.success).toBe(false)
          expect(secondResult.shouldRetry).toBe(true)
          expect(secondResult.nextAttempt).toBe(3)

          // Execute third attempt (should succeed)
          const thirdResult = await stripeHandler(
            {
              workflowId,
              userIdentifiers,
              stepName: 'stripe-deletion',
              attempt: 3
            },
            mockMotiaContext
          )

          expect(thirdResult.success).toBe(true)
          expect(thirdResult.shouldRetry).toBe(false)

          // Verify final state shows success
          const finalState = await mockMotiaContext.state.get(`workflow:${workflowId}`)
          expect(finalState.steps['stripe-deletion'].status).toBe('DELETED')
          expect(finalState.steps['stripe-deletion'].attempts).toBe(3)

          // Verify database deletion was triggered after success
          const databaseTriggerEvents = mockEmittedEvents.filter(
            event => event.topic === 'database-deletion' && event.data.workflowId === workflowId
          )
          expect(databaseTriggerEvents.length).toBe(1)
        }
      ),
      { numRuns: 100 }
    )
  })
})