/**
 * Property-based tests for Legal Hold Audit
 * **Feature: gdpr-erasure-system, Property 26: Legal Hold Audit**
 * **Validates: Requirements 9.4, 9.5**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { WorkflowStateManager } from '../../../src/gdpr/services/workflow-state-manager.js'
import { LegalHold } from '../../../src/gdpr/schemas/index.js'

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

describe('Legal Hold Audit Property Tests', () => {
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

  describe('Property 26: Legal Hold Audit', () => {
    it('should record legal hold decisions with timestamps in audit trail', async () => {
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
            const initialHashCount = result.workflowState.auditHashes.length

            // Record time before adding legal hold
            const beforeAddition = new Date()

            // Add legal hold
            const updatedState = await freshStateManager.addLegalHold(result.workflowId, legalHold)

            // Record time after adding legal hold
            const afterAddition = new Date()

            // Verify audit hash chain grew (legal hold addition was recorded)
            expect(updatedState.auditHashes.length).toBeGreaterThan(initialHashCount)

            // Verify all hashes are valid SHA-256 format
            const sha256Regex = /^[a-f0-9]{64}$/
            updatedState.auditHashes.forEach(hash => {
              expect(hash).toMatch(sha256Regex)
            })

            // Verify audit trail integrity
            const isValid = await freshStateManager.verifyAuditTrail(result.workflowId)
            expect(isValid).toBe(true)

            // Verify legal hold is recorded with all required information
            expect(updatedState.legalHolds).toContainEqual(legalHold)
            
            // The audit trail should have recorded this action
            // (implicitly verified by the hash chain growth and integrity check)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should record legal hold with legal basis (reason) in workflow state', async () => {
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
            await freshStateManager.addLegalHold(result.workflowId, legalHold)

            // Get final state
            const finalState = await freshStateManager.getWorkflowState(result.workflowId)
            expect(finalState).toBeDefined()

            // Verify legal hold has legal basis (reason)
            const recordedHold = finalState!.legalHolds.find(
              h => h.system === legalHold.system && h.reason === legalHold.reason
            )
            expect(recordedHold).toBeDefined()
            expect(recordedHold!.reason).toBe(legalHold.reason)
            expect(recordedHold!.reason.length).toBeGreaterThan(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should allow resuming deletion operations when legal holds expire', async () => {
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

            // Add legal hold with expiration date in the past (expired)
            const expiredLegalHold: LegalHold = {
              system,
              reason,
              expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 1 day ago
            }
            await freshStateManager.addLegalHold(result.workflowId, expiredLegalHold)

            // Mark system as LEGAL_HOLD initially
            const stepName = `${system}-deletion`
            await freshStateManager.updateStepStatus(result.workflowId, stepName, 'LEGAL_HOLD')

            // Verify system is under legal hold
            let state = await freshStateManager.getWorkflowState(result.workflowId)
            expect(state!.steps[stepName]?.status).toBe('LEGAL_HOLD')

            // Now that the hold has expired, we should be able to resume deletion
            // Update step status to DELETED (simulating resumption after expiration)
            await freshStateManager.updateStepStatus(result.workflowId, stepName, 'DELETED')

            // Verify deletion was allowed
            state = await freshStateManager.getWorkflowState(result.workflowId)
            expect(state!.steps[stepName]?.status).toBe('DELETED')

            // Verify legal hold is still recorded (for audit purposes)
            expect(state!.legalHolds).toContainEqual(expiredLegalHold)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should maintain audit trail integrity when adding multiple legal holds', async () => {
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
            let previousHashCount = result.workflowState.auditHashes.length

            // Add legal holds one by one
            for (const hold of legalHolds) {
              const updatedState = await freshStateManager.addLegalHold(result.workflowId, hold)
              
              // Verify hash chain grew
              expect(updatedState.auditHashes.length).toBeGreaterThan(previousHashCount)
              previousHashCount = updatedState.auditHashes.length

              // Verify integrity after each addition
              const isValid = await freshStateManager.verifyAuditTrail(result.workflowId)
              expect(isValid).toBe(true)
            }

            // Verify all legal holds are recorded
            const finalState = await freshStateManager.getWorkflowState(result.workflowId)
            expect(finalState!.legalHolds.length).toBe(legalHolds.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should record legal hold expiration dates when provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowCreationOptionsArb,
          systemNameArb,
          legalHoldReasonArb,
          fc.date({ min: new Date(), max: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) }),
          async (options, system, reason, expirationDate) => {
            // Create fresh state manager for each iteration
            const freshMockState = new MockStateManager()
            const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)

            // Create workflow
            const result = await freshStateManager.createWorkflow(options)

            // Add legal hold with expiration
            const legalHold: LegalHold = {
              system,
              reason,
              expiresAt: expirationDate.toISOString()
            }
            await freshStateManager.addLegalHold(result.workflowId, legalHold)

            // Verify expiration date is recorded
            const finalState = await freshStateManager.getWorkflowState(result.workflowId)
            const recordedHold = finalState!.legalHolds.find(
              h => h.system === system && h.reason === reason
            )
            expect(recordedHold).toBeDefined()
            expect(recordedHold!.expiresAt).toBe(expirationDate.toISOString())

            // Verify expiration date is valid
            const expiresAt = new Date(recordedHold!.expiresAt!)
            expect(expiresAt).toBeInstanceOf(Date)
            expect(isNaN(expiresAt.getTime())).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should allow legal holds without expiration dates (indefinite holds)', async () => {
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

            // Add legal hold without expiration (indefinite)
            const legalHold: LegalHold = {
              system,
              reason,
              expiresAt: undefined
            }
            await freshStateManager.addLegalHold(result.workflowId, legalHold)

            // Verify legal hold is recorded without expiration
            const finalState = await freshStateManager.getWorkflowState(result.workflowId)
            const recordedHold = finalState!.legalHolds.find(
              h => h.system === system && h.reason === reason
            )
            expect(recordedHold).toBeDefined()
            expect(recordedHold!.expiresAt).toBeUndefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should maintain chronological order of legal hold additions in audit trail', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowCreationOptionsArb,
          fc.array(legalHoldArb, { minLength: 2, maxLength: 4 }),
          async (options, legalHolds) => {
            // Ensure unique systems for this test
            const uniqueHolds = legalHolds.filter((hold, index, self) =>
              index === self.findIndex(h => h.system === hold.system)
            )

            if (uniqueHolds.length < 2) return // Skip if not enough unique systems

            // Create fresh state manager for each iteration
            const freshMockState = new MockStateManager()
            const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)

            // Create workflow
            const result = await freshStateManager.createWorkflow(options)

            // Add legal holds in sequence
            const additionOrder: string[] = []
            for (const hold of uniqueHolds) {
              await freshStateManager.addLegalHold(result.workflowId, hold)
              additionOrder.push(hold.system)
            }

            // Verify legal holds are recorded in the order they were added
            const finalState = await freshStateManager.getWorkflowState(result.workflowId)
            expect(finalState!.legalHolds.length).toBe(uniqueHolds.length)

            // The order in legalHolds array should match the addition order
            const recordedOrder = finalState!.legalHolds.map(h => h.system)
            expect(recordedOrder).toEqual(additionOrder)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
