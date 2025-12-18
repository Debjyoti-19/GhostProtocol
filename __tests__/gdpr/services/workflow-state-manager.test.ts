/**
 * Property-based tests for WorkflowStateManager
 * **Feature: gdpr-erasure-system, Property 3: Data Lineage Capture**
 * **Validates: Requirements 1.4, 1.7**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { WorkflowStateManager } from '../../../src/gdpr/services/workflow-state-manager.js'
import { UserIdentifiers, WorkflowState } from '../../../src/gdpr/types/index.js'

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

  // Helper for testing
  getStorageSnapshot() {
    const snapshot: Record<string, Record<string, any>> = {}
    for (const [groupId, group] of this.storage.entries()) {
      snapshot[groupId] = Object.fromEntries(group.entries())
    }
    return snapshot
  }
}

// Fast-check generators
const userIdArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
const emailArb = fc.emailAddress()
const phoneArb = fc.string({ minLength: 10, maxLength: 15 }).map(s => `+1${s.replace(/\D/g, '').slice(0, 10)}`)
const aliasArb = fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0)

const userIdentifiersArb: fc.Arbitrary<UserIdentifiers> = fc.record({
  userId: userIdArb,
  emails: fc.array(emailArb, { minLength: 0, maxLength: 5 }),
  phones: fc.array(phoneArb, { minLength: 0, maxLength: 3 }),
  aliases: fc.array(aliasArb, { minLength: 0, maxLength: 5 })
})

const jurisdictionArb = fc.constantFrom('EU', 'US', 'OTHER')

const requestedByArb = fc.record({
  userId: userIdArb,
  role: fc.constantFrom('compliance_officer', 'legal_counsel', 'admin'),
  organization: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
})

const legalProofArb = fc.record({
  type: fc.constantFrom('SIGNED_REQUEST', 'LEGAL_FORM', 'OTP_VERIFIED'),
  evidence: fc.string({ minLength: 10, maxLength: 200 }),
  verifiedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString())
})

const workflowCreationOptionsArb = fc.record({
  userIdentifiers: userIdentifiersArb,
  jurisdiction: jurisdictionArb,
  requestedBy: requestedByArb,
  legalProof: legalProofArb,
  policyVersion: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined })
})

describe('WorkflowStateManager Property Tests', () => {
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

  describe('Property 3: Data Lineage Capture', () => {
    it('should capture complete pre-deletion data lineage snapshot for any created workflow', async () => {
      await fc.assert(
        fc.asyncProperty(workflowCreationOptionsArb, async (options) => {
          // Create fresh state manager for each iteration
          const freshMockState = new MockStateManager()
          const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)
          
          // Create workflow
          const result = await freshStateManager.createWorkflow(options)

          // Verify workflow was created
          expect(result.workflowId).toBeDefined()
          expect(result.requestId).toBeDefined()
          expect(result.isExisting).toBe(false)

          // Verify data lineage snapshot exists and is complete
          const dataLineage = result.workflowState.dataLineageSnapshot
          expect(dataLineage).toBeDefined()
          expect(dataLineage.capturedAt).toBeDefined()
          expect(new Date(dataLineage.capturedAt)).toBeInstanceOf(Date)

          // Verify systems are detected
          expect(dataLineage.systems).toBeDefined()
          expect(Array.isArray(dataLineage.systems)).toBe(true)
          expect(dataLineage.systems.length).toBeGreaterThan(0)
          
          // Should include expected systems from design
          const expectedSystems = ['stripe', 'database', 'intercom', 'sendgrid', 'crm', 'analytics']
          expectedSystems.forEach(system => {
            expect(dataLineage.systems).toContain(system)
          })

          // Verify identifiers are captured
          expect(dataLineage.identifiers).toBeDefined()
          expect(Array.isArray(dataLineage.identifiers)).toBe(true)
          expect(dataLineage.identifiers.length).toBeGreaterThan(0)

          // Should include user ID
          expect(dataLineage.identifiers).toContain(options.userIdentifiers.userId)

          // Should include all emails
          options.userIdentifiers.emails.forEach(email => {
            expect(dataLineage.identifiers).toContain(email)
          })

          // Should include all phones
          options.userIdentifiers.phones.forEach(phone => {
            expect(dataLineage.identifiers).toContain(phone)
          })

          // Should include all aliases
          options.userIdentifiers.aliases.forEach(alias => {
            expect(dataLineage.identifiers).toContain(alias)
          })

          // Verify the snapshot is embedded in the workflow state
          const storedWorkflow = await freshStateManager.getWorkflowState(result.workflowId)
          expect(storedWorkflow).toBeDefined()
          expect(storedWorkflow!.dataLineageSnapshot).toEqual(dataLineage)
        }),
        { numRuns: 100 }
      )
    })

    it('should maintain data lineage snapshot immutability across workflow updates', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowCreationOptionsArb,
          fc.constantFrom('IN_PROGRESS', 'COMPLETED', 'FAILED'),
          async (options, newStatus) => {
            // Create fresh state manager for each iteration
            const freshMockState = new MockStateManager()
            const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)
            
            // Create initial workflow
            const result = await freshStateManager.createWorkflow(options)
            const originalLineage = result.workflowState.dataLineageSnapshot

            // Update workflow status
            const updatedState = await freshStateManager.updateWorkflowState(
              result.workflowId,
              { status: newStatus as any }
            )

            // Verify data lineage snapshot remains unchanged
            expect(updatedState.dataLineageSnapshot).toEqual(originalLineage)
            expect(updatedState.dataLineageSnapshot.capturedAt).toBe(originalLineage.capturedAt)
            expect(updatedState.dataLineageSnapshot.systems).toEqual(originalLineage.systems)
            expect(updatedState.dataLineageSnapshot.identifiers).toEqual(originalLineage.identifiers)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should ensure data lineage contains all user identifiers without duplicates', async () => {
      await fc.assert(
        fc.asyncProperty(userIdentifiersArb, async (userIdentifiers) => {
          // Create fresh state manager for each iteration
          const freshMockState = new MockStateManager()
          const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)
          
          const options = {
            userIdentifiers,
            jurisdiction: 'EU' as const,
            requestedBy: {
              userId: 'test-user',
              role: 'compliance_officer',
              organization: 'test-org'
            },
            legalProof: {
              type: 'SIGNED_REQUEST' as const,
              evidence: 'test-evidence',
              verifiedAt: new Date().toISOString()
            }
          }

          const result = await freshStateManager.createWorkflow(options)
          const dataLineage = result.workflowState.dataLineageSnapshot

          // Collect all expected identifiers
          const expectedIdentifiers = [
            userIdentifiers.userId,
            ...userIdentifiers.emails,
            ...userIdentifiers.phones,
            ...userIdentifiers.aliases
          ]



          // Verify all identifiers are present
          expectedIdentifiers.forEach(identifier => {
            expect(dataLineage.identifiers).toContain(identifier)
          })

          // Verify no duplicates (set size should equal array length)
          const uniqueIdentifiers = new Set(dataLineage.identifiers)
          expect(uniqueIdentifiers.size).toBe(dataLineage.identifiers.length)

          // Verify minimum length (at least the userId)
          expect(dataLineage.identifiers.length).toBeGreaterThanOrEqual(1)
        }),
        { numRuns: 100 }
      )
    })

    it('should create valid timestamps in data lineage snapshots', async () => {
      await fc.assert(
        fc.asyncProperty(workflowCreationOptionsArb, async (options) => {
          // Create fresh state manager for each iteration
          const freshMockState = new MockStateManager()
          const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)
          
          const beforeCreation = new Date()
          const result = await freshStateManager.createWorkflow(options)
          const afterCreation = new Date()

          const capturedAt = new Date(result.workflowState.dataLineageSnapshot.capturedAt)

          // Timestamp should be valid
          expect(capturedAt).toBeInstanceOf(Date)
          expect(isNaN(capturedAt.getTime())).toBe(false)

          // Timestamp should be within reasonable bounds
          expect(capturedAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime() - 1000) // 1 second tolerance
          expect(capturedAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime() + 1000) // 1 second tolerance
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('Concurrency Control Properties', () => {
    it('should prevent concurrent workflows for the same user', async () => {
      await fc.assert(
        fc.asyncProperty(workflowCreationOptionsArb, async (options) => {
          // Create fresh state manager for each iteration
          const freshMockState = new MockStateManager()
          const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)
          
          // Create first workflow
          const result1 = await freshStateManager.createWorkflow(options)
          expect(result1.isExisting).toBe(false)

          // Attempt to create second workflow with same user
          const result2 = await freshStateManager.createWorkflow(options)
          expect(result2.isExisting).toBe(true)
          expect(result2.workflowId).toBe(result1.workflowId)
          expect(result2.requestId).toBe(result1.requestId)
        }),
        { numRuns: 50 }
      )
    })

    it('should detect duplicate requests via hash', async () => {
      await fc.assert(
        fc.asyncProperty(workflowCreationOptionsArb, async (options) => {
          // Create fresh state manager for each iteration
          const freshMockState = new MockStateManager()
          const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)
          
          // Create first workflow
          const result1 = await freshStateManager.createWorkflow(options)
          
          // Release user lock to test hash-based deduplication
          await freshStateManager.releaseUserLock(options.userIdentifiers.userId)

          // Create identical request (should be detected via hash)
          const result2 = await freshStateManager.createWorkflow(options)
          expect(result2.isExisting).toBe(true)
          expect(result2.workflowId).toBe(result1.workflowId)
        }),
        { numRuns: 50 }
      )
    })
  })

  describe('State Update Properties', () => {
    it('should maintain audit hash chain integrity', async () => {
      await fc.assert(
        fc.asyncProperty(workflowCreationOptionsArb, async (options) => {
          // Create fresh state manager for each iteration
          const freshMockState = new MockStateManager()
          const freshStateManager = new WorkflowStateManager(freshMockState as any, mockLogger)
          
          const result = await freshStateManager.createWorkflow(options)
          const initialHashCount = result.workflowState.auditHashes.length

          // Perform several updates
          await freshStateManager.updateStepStatus(result.workflowId, 'stripe-deletion', 'IN_PROGRESS')
          await freshStateManager.updateStepStatus(result.workflowId, 'stripe-deletion', 'DELETED')
          await freshStateManager.updateWorkflowState(result.workflowId, { status: 'COMPLETED' })

          const finalState = await freshStateManager.getWorkflowState(result.workflowId)
          expect(finalState).toBeDefined()
          
          // Hash chain should have grown
          expect(finalState!.auditHashes.length).toBeGreaterThan(initialHashCount)
          
          // All hashes should be valid SHA-256 format
          const sha256Regex = /^[a-f0-9]{64}$/
          finalState!.auditHashes.forEach(hash => {
            expect(hash).toMatch(sha256Regex)
          })

          // Verify audit trail integrity
          const isValid = await freshStateManager.verifyAuditTrail(result.workflowId)
          expect(isValid).toBe(true)
        }),
        { numRuns: 50 }
      )
    })
  })
})