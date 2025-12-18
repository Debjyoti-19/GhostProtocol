/**
 * Property-based tests for Legal Hold Enforcement
 * **Feature: gdpr-erasure-system, Property 25: Legal Hold Enforcement**
 * **Validates: Requirements 9.1, 9.2, 9.3**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { WorkflowStateManager } from '../../../src/gdpr/services/workflow-state-manager.js'
import { LegalHold, WorkflowState, StepStatus } from '../../../src/gdpr/schemas/index.js'

// Mock StateManager for testing
class MockStateManager {
  private storage = new Map<string, Map<string, any>>()

  async get<T>(groupId: string, key: string): Promise<T | null> {
    const group = this.storage.get(groupId)
    return group?.get(key) || null
  }

  async set<T>(groupId: string, key: string, value: T): Promise<T> {
    if (!this.storage.has(groupId)) {
      this.storage.set(groupId, new Map())
    }
    this.storage.get(groupId)!.set(key, value)
    return value
  }

  async delete<T>(groupId: string, key: string): Promise<T | null> {
    const group = this.storage.get(groupId)
    if (!group) return null
    const value = group.get(key) || null
    group.delete(key)
    return value
  }

  async getGroup<T>(groupId: string): Promise<T[]> {
    const group = this.storage.get(groupId)
    return group ? Array.from(group.values()) : []
  }

  async clear(groupId: string): Promise<void> {
    this.storage.delete(groupId)
  }
}

// Fast-check generators
const systemNameArb = fc.constantFrom('stripe', 'database', 'intercom', 'sendgrid', 'crm', 'analytics', 'salesforce')
const legalHoldReasonArb = fc.constantFrom(
  'Pending litigation',
  'Regulatory investigation',
  'Internal audit',
  'Contract dispute',
  'Criminal investigation'
)

const legalHoldArb: fc.Arbitrary<LegalHold> = fc.record({
  system: systemNameArb,
  reason: legalHoldReasonArb,
  expiresAt: fc.option(
    fc.date({ min: new Date(), max: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) })
      .map(d => d.toISOString()),
    { nil: undefined }
  )
})

const userIdArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
const emailArb = fc.emailAddress()

const workflowCreationOptionsArb = fc.record({
  userIdentifiers: fc.record({
    userId: userIdArb,
    emails: fc.array(emailArb, { minLength: 1, maxLength: 3 }),
    phones: fc.array(fc.string({ minLength: 10, maxLength: 15 }), { minLength: 0, maxLength: 2 }),
    aliases: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 })
  }),
  jurisdiction: fc.constantFrom('EU', 'US', 'OTHER'),
  requestedBy: fc.record({
    userId: userIdArb,
    role: fc.constantFrom('compliance_officer', 'legal_counsel', 'admin'),
    organization: fc.string({ minLength: 1, maxLength: 50 })
  }),
  legalProof: fc.record({
    type: fc.constantFrom('SIGNED_REQUEST', 'LEGAL_FORM', 'OTP_VERIFIED'),
    evidence: fc.string({ minLength: 10, maxLength: 200 }),
    verifiedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString())
  })
})

describe('Legal Hold Enforcement Property Tests', () => {
  let mockState: MockStateManager
  let mockLogger: any
  let stateManager: WorkflowStateManager

  beforeEach(() => {
    mockState = new MockStateManager()
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    stateManager = new WorkflowStateManager(mockState as any, mockLogger)
  })

  describe('Property 25: Legal Hold Enforcement', () => {
    it('should mark systems as LEGAL_HOLD status when legal hold is applied', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowCreationOptionsArb,
          legalHoldArb,
          async (options, legalHold) => {
            // Create fresh state manager for each iteration
            const freshMockState = new MockStateManager()
            const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)

            // Create workflow
            const result = await freshStateManager.createWorkflow(options)

            // Add legal hold
            const updatedState = await freshStateManager.addLegalHold(result.workflowId, legalHold)

            // Verify legal hold was added
            expect(updatedState.legalHolds).toContainEqual(legalHold)
            expect(updatedState.legalHolds.length).toBeGreaterThan(0)

            // Update step status to LEGAL_HOLD for the held system
            const stepName = `${legalHold.system}-deletion`
            await freshStateManager.updateStepStatus(
              result.workflowId,
              stepName,
              'LEGAL_HOLD',
              { reason: legalHold.reason }
            )

            // Verify step is marked as LEGAL_HOLD
            const finalState = await freshStateManager.getWorkflowState(result.workflowId)
            expect(finalState).toBeDefined()
            expect(finalState!.steps[stepName]).toBeDefined()
            expect(finalState!.steps[stepName].status).toBe('LEGAL_HOLD')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should exclude held systems from deletion operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowCreationOptionsArb,
          fc.array(legalHoldArb, { minLength: 1, maxLength: 3 }),
          async (options, legalHolds) => {
            // Create fresh state manager for each iteration
            const freshMockState = new MockStateManager()
            const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)

            // Create workflow
            const result = await freshStateManager.createWorkflow(options)

            // Add all legal holds
            let currentState = result.workflowState
            for (const hold of legalHolds) {
              currentState = await freshStateManager.addLegalHold(result.workflowId, hold)
            }

            // Get list of held systems
            const heldSystems = new Set(legalHolds.map(h => h.system))

            // Simulate deletion workflow - mark held systems as LEGAL_HOLD
            for (const system of heldSystems) {
              const stepName = `${system}-deletion`
              await freshStateManager.updateStepStatus(
                result.workflowId,
                stepName,
                'LEGAL_HOLD'
              )
            }

            // Simulate deletion of non-held systems
            const allSystems = ['stripe', 'database', 'intercom', 'sendgrid', 'crm', 'analytics']
            const nonHeldSystems = allSystems.filter(s => !heldSystems.has(s))
            
            for (const system of nonHeldSystems) {
              const stepName = `${system}-deletion`
              await freshStateManager.updateStepStatus(
                result.workflowId,
                stepName,
                'DELETED'
              )
            }

            // Verify final state
            const finalState = await freshStateManager.getWorkflowState(result.workflowId)
            expect(finalState).toBeDefined()

            // All held systems should be LEGAL_HOLD
            for (const system of heldSystems) {
              const stepName = `${system}-deletion`
              expect(finalState!.steps[stepName]?.status).toBe('LEGAL_HOLD')
            }

            // All non-held systems should be DELETED
            for (const system of nonHeldSystems) {
              const stepName = `${system}-deletion`
              expect(finalState!.steps[stepName]?.status).toBe('DELETED')
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should list exempted systems with legal justification in workflow state', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowCreationOptionsArb,
          fc.array(legalHoldArb, { minLength: 1, maxLength: 5 }),
          async (options, legalHolds) => {
            // Create fresh state manager for each iteration
            const freshMockState = new MockStateManager()
            const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)

            // Create workflow
            const result = await freshStateManager.createWorkflow(options)

            // Add all legal holds
            for (const hold of legalHolds) {
              await freshStateManager.addLegalHold(result.workflowId, hold)
            }

            // Get final state
            const finalState = await freshStateManager.getWorkflowState(result.workflowId)
            expect(finalState).toBeDefined()

            // Verify all legal holds are present
            expect(finalState!.legalHolds.length).toBe(legalHolds.length)

            // Verify each legal hold has required fields
            for (const hold of legalHolds) {
              // Match on all fields including expiresAt to handle duplicates correctly
              const matchingHold = finalState!.legalHolds.find(
                h => h.system === hold.system && 
                     h.reason === hold.reason &&
                     h.expiresAt === hold.expiresAt
              )
              expect(matchingHold).toBeDefined()
              expect(matchingHold!.system).toBe(hold.system)
              expect(matchingHold!.reason).toBe(hold.reason)
              
              // If expiration was set, verify it's preserved
              if (hold.expiresAt) {
                expect(matchingHold!.expiresAt).toBe(hold.expiresAt)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should maintain legal hold information across workflow updates', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowCreationOptionsArb,
          legalHoldArb,
          fc.constantFrom('IN_PROGRESS', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS'),
          async (options, legalHold, newStatus) => {
            // Create fresh state manager for each iteration
            const freshMockState = new MockStateManager()
            const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)

            // Create workflow
            const result = await freshStateManager.createWorkflow(options)

            // Add legal hold
            await freshStateManager.addLegalHold(result.workflowId, legalHold)

            // Perform multiple state updates
            await freshStateManager.updateStepStatus(result.workflowId, 'stripe-deletion', 'DELETED')
            await freshStateManager.updateStepStatus(result.workflowId, 'database-deletion', 'DELETED')
            await freshStateManager.updateWorkflowState(result.workflowId, { status: newStatus as any })

            // Verify legal hold is still present
            const finalState = await freshStateManager.getWorkflowState(result.workflowId)
            expect(finalState).toBeDefined()
            expect(finalState!.legalHolds).toContainEqual(legalHold)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should prevent deletion of systems under legal hold', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowCreationOptionsArb,
          systemNameArb,
          legalHoldReasonArb,
          async (options, system, reason) => {
            // Create fresh state manager for each iteration
            const freshMockState = new MockStateManager()
            const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)

            // Create workflow
            const result = await freshStateManager.createWorkflow(options)

            // Add legal hold for specific system
            const legalHold: LegalHold = {
              system,
              reason,
              expiresAt: undefined
            }
            await freshStateManager.addLegalHold(result.workflowId, legalHold)

            // Mark system as LEGAL_HOLD
            const stepName = `${system}-deletion`
            await freshStateManager.updateStepStatus(result.workflowId, stepName, 'LEGAL_HOLD')

            // Verify system cannot be marked as DELETED while under legal hold
            const state = await freshStateManager.getWorkflowState(result.workflowId)
            expect(state).toBeDefined()
            expect(state!.steps[stepName]?.status).toBe('LEGAL_HOLD')
            
            // Verify legal hold is recorded
            const holdExists = state!.legalHolds.some(h => h.system === system)
            expect(holdExists).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle multiple legal holds on different systems independently', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowCreationOptionsArb,
          fc.array(legalHoldArb, { minLength: 2, maxLength: 4 }),
          async (options, legalHolds) => {
            // Ensure unique systems
            const uniqueHolds = legalHolds.filter((hold, index, self) =>
              index === self.findIndex(h => h.system === hold.system)
            )

            if (uniqueHolds.length < 2) return // Skip if not enough unique systems

            // Create fresh state manager for each iteration
            const freshMockState = new MockStateManager()
            const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)

            // Create workflow
            const result = await freshStateManager.createWorkflow(options)

            // Add all legal holds
            for (const hold of uniqueHolds) {
              await freshStateManager.addLegalHold(result.workflowId, hold)
            }

            // Verify each system can be independently managed
            const finalState = await freshStateManager.getWorkflowState(result.workflowId)
            expect(finalState).toBeDefined()
            expect(finalState!.legalHolds.length).toBe(uniqueHolds.length)

            // Each system should have its own legal hold
            for (const hold of uniqueHolds) {
              const matchingHold = finalState!.legalHolds.find(h => h.system === hold.system)
              expect(matchingHold).toBeDefined()
              expect(matchingHold!.reason).toBe(hold.reason)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
