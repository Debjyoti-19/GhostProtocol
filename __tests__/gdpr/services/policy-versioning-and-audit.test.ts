/**
 * Property-Based Tests for Policy Versioning and Audit
 * 
 * **Feature: gdpr-erasure-system, Property 30: Policy Versioning and Audit**
 * **Validates: Requirements 11.3, 11.4, 11.5**
 * 
 * Property 30: Policy Versioning and Audit
 * For any workflow execution, the system should record the applied policy version in 
 * audit trails and certificates, maintaining historical policy records
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { PolicyManager } from '../../../src/gdpr/services/policy-manager.js'
import { WorkflowStateManager } from '../../../src/gdpr/services/workflow-state-manager.js'
import { CertificateGenerator } from '../../../src/gdpr/services/certificate-generator.js'
import { AuditTrail } from '../../../src/gdpr/services/audit-trail.js'
import type { Jurisdiction, PolicyConfig } from '../../../src/gdpr/types/index.js'

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

// Mock logger
const mockLogger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {}
}

describe('Property 30: Policy Versioning and Audit', () => {
  let state: MockStateManager
  let policyManager: PolicyManager
  let workflowStateManager: WorkflowStateManager

  beforeEach(() => {
    state = new MockStateManager()
    policyManager = new PolicyManager(state as any, mockLogger)
    workflowStateManager = new WorkflowStateManager(state as any, mockLogger)
  })

  /**
   * Property: For any workflow, the applied policy version should be recorded in workflow state
   */
  it('should record policy version in workflow state for any workflow', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        fc.uuid(),
        fc.emailAddress(),
        async (jurisdiction, userId, email) => {
          // Get current policy
          const policy = await policyManager.getPolicyForJurisdiction(jurisdiction)

          // Create workflow
          const result = await workflowStateManager.createWorkflow({
            userIdentifiers: {
              userId,
              emails: [email],
              phones: [],
              aliases: []
            },
            jurisdiction,
            requestedBy: {
              userId: 'admin-123',
              role: 'compliance_officer',
              organization: 'test-org'
            },
            legalProof: {
              type: 'SIGNED_REQUEST',
              evidence: 'test-evidence',
              verifiedAt: new Date().toISOString()
            }
          })

          // Verify policy version is recorded in workflow state
          expect(result.workflowState.policyVersion).toBeDefined()
          expect(result.workflowState.policyVersion).toBe(policy.version)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: For any workflow, policy application should be recorded with complete snapshot
   */
  it('should record complete policy application snapshot for any workflow', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        fc.uuid(),
        fc.emailAddress(),
        async (jurisdiction, userId, email) => {
          // Create workflow
          const result = await workflowStateManager.createWorkflow({
            userIdentifiers: {
              userId,
              emails: [email],
              phones: [],
              aliases: []
            },
            jurisdiction,
            requestedBy: {
              userId: 'admin-123',
              role: 'compliance_officer',
              organization: 'test-org'
            },
            legalProof: {
              type: 'SIGNED_REQUEST',
              evidence: 'test-evidence',
              verifiedAt: new Date().toISOString()
            }
          })

          // Get policy application record
          const policyApplication = await policyManager.getPolicyApplication(result.workflowId)

          // Verify policy application was recorded
          expect(policyApplication).toBeDefined()
          expect(policyApplication!.workflowId).toBe(result.workflowId)
          expect(policyApplication!.jurisdiction).toBe(jurisdiction)
          expect(policyApplication!.policyVersion).toBeDefined()
          expect(policyApplication!.appliedAt).toBeDefined()

          // Verify complete config snapshot is included
          expect(policyApplication!.configSnapshot).toBeDefined()
          expect(policyApplication!.configSnapshot.version).toBe(policyApplication!.policyVersion)
          expect(policyApplication!.configSnapshot.jurisdiction).toBe(jurisdiction)
          expect(policyApplication!.configSnapshot.retentionRules).toBeDefined()
          expect(policyApplication!.configSnapshot.legalHoldRules).toBeDefined()
          expect(policyApplication!.configSnapshot.zombieCheckInterval).toBeDefined()
          expect(policyApplication!.configSnapshot.confidenceThresholds).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: For any new policy version, version number should increment correctly
   */
  it('should increment version numbers correctly when creating new policy versions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        fc.integer({ min: 1, max: 10 }),
        async (jurisdiction, iterations) => {
          // Get initial policy
          const initialPolicy = await policyManager.getPolicyForJurisdiction(jurisdiction)
          const initialVersion = initialPolicy.version

          let previousVersion = initialVersion
          
          // Create multiple policy versions
          for (let i = 0; i < iterations; i++) {
            const newPolicy = await policyManager.createPolicyVersion(
              jurisdiction,
              {
                retentionRules: initialPolicy.retentionRules,
                legalHoldRules: initialPolicy.legalHoldRules,
                zombieCheckInterval: initialPolicy.zombieCheckInterval + i,
                confidenceThresholds: initialPolicy.confidenceThresholds
              },
              `test-user-${i}`,
              `Test update ${i}`
            )

            // Verify version incremented
            expect(newPolicy.version).not.toBe(previousVersion)
            
            // Verify version format (should be semantic versioning)
            expect(newPolicy.version).toMatch(/^\d+\.\d+\.\d+$/)
            
            previousVersion = newPolicy.version
          }
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Property: For any policy version, it should be retrievable from history
   */
  it('should maintain historical policy records for any created version', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (jurisdiction, reason) => {
          // Get initial policy
          const initialPolicy = await policyManager.getPolicyForJurisdiction(jurisdiction)

          // Create new policy version
          const newPolicy = await policyManager.createPolicyVersion(
            jurisdiction,
            {
              retentionRules: initialPolicy.retentionRules,
              legalHoldRules: initialPolicy.legalHoldRules,
              zombieCheckInterval: initialPolicy.zombieCheckInterval + 1,
              confidenceThresholds: initialPolicy.confidenceThresholds
            },
            'test-user',
            reason
          )

          // Retrieve policy version from history
          const retrievedPolicy = await policyManager.getPolicyVersion(newPolicy.version, jurisdiction)

          // Verify policy was stored and is retrievable
          expect(retrievedPolicy).toBeDefined()
          expect(retrievedPolicy!.version).toBe(newPolicy.version)
          expect(retrievedPolicy!.jurisdiction).toBe(jurisdiction)
          expect(retrievedPolicy!.retentionRules).toEqual(newPolicy.retentionRules)
          expect(retrievedPolicy!.legalHoldRules).toEqual(newPolicy.legalHoldRules)
          expect(retrievedPolicy!.zombieCheckInterval).toBe(newPolicy.zombieCheckInterval)
        }
      ),
      { numRuns: 50 }
    )
  })

  /**
   * Property: For any certificate, it should reference the specific policy version used
   */
  it('should include policy version reference in certificates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        fc.uuid(),
        fc.emailAddress(),
        async (jurisdiction, userId, email) => {
          // Create workflow
          const result = await workflowStateManager.createWorkflow({
            userIdentifiers: {
              userId,
              emails: [email],
              phones: [],
              aliases: []
            },
            jurisdiction,
            requestedBy: {
              userId: 'admin-123',
              role: 'compliance_officer',
              organization: 'test-org'
            },
            legalProof: {
              type: 'SIGNED_REQUEST',
              evidence: 'test-evidence',
              verifiedAt: new Date().toISOString()
            }
          })

          // Update workflow to completed state
          const completedState = await workflowStateManager.updateWorkflowState(
            result.workflowId,
            { status: 'COMPLETED' }
          )

          // Create audit trail
          const auditTrail = new AuditTrail(result.workflowId)

          // Generate certificate
          const certificate = CertificateGenerator.generateCertificate({
            workflowState: completedState,
            auditTrail
          })

          // Verify certificate includes policy version
          expect(certificate.policyVersion).toBeDefined()
          expect(certificate.policyVersion).toBe(completedState.policyVersion)

          // Verify policy version matches the one applied to workflow
          const policyApplication = await policyManager.getPolicyApplication(result.workflowId)
          expect(certificate.policyVersion).toBe(policyApplication!.policyVersion)
        }
      ),
      { numRuns: 50 }
    )
  })

  /**
   * Property: For any policy configuration, validation should correctly identify issues
   */
  it('should validate policy configurations correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        async (jurisdiction) => {
          // Get valid policy
          const validPolicy = await policyManager.getPolicyForJurisdiction(jurisdiction)

          // Validate valid policy
          const validResult = policyManager.validatePolicy(validPolicy)
          expect(validResult.valid).toBe(true)
          expect(validResult.errors).toHaveLength(0)

          // Create invalid policy (missing required system)
          const invalidPolicy: PolicyConfig = {
            ...validPolicy,
            retentionRules: validPolicy.retentionRules.filter(r => r.system !== 'stripe')
          }

          const invalidResult = policyManager.validatePolicy(invalidPolicy)
          expect(invalidResult.valid).toBe(false)
          expect(invalidResult.errors.length).toBeGreaterThan(0)
          expect(invalidResult.errors.some(e => e.includes('stripe'))).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  /**
   * Property: For any policy with invalid confidence thresholds, validation should fail
   */
  it('should reject policies with invalid confidence thresholds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        fc.double({ min: 0.6, max: 0.9, noNaN: true }),
        fc.double({ min: 0.3, max: 0.5, noNaN: true }),
        async (jurisdiction, autoDelete, manualReview) => {
          // Skip if values are too close (floating point precision issues)
          if (Math.abs(autoDelete - manualReview) < 0.01) {
            return
          }

          // Get valid policy
          const validPolicy = await policyManager.getPolicyForJurisdiction(jurisdiction)

          // Create policy with inverted thresholds (auto < manual)
          const invalidPolicy: PolicyConfig = {
            ...validPolicy,
            confidenceThresholds: {
              autoDelete: manualReview, // Lower value
              manualReview: autoDelete  // Higher value
            }
          }

          const result = policyManager.validatePolicy(invalidPolicy)
          expect(result.valid).toBe(false)
          expect(result.errors.some(e => e.includes('threshold'))).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  /**
   * Property: For any workflow, policy snapshot should remain immutable
   */
  it('should maintain immutable policy snapshots across workflow lifecycle', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        fc.uuid(),
        fc.emailAddress(),
        async (jurisdiction, userId, email) => {
          // Create workflow
          const result = await workflowStateManager.createWorkflow({
            userIdentifiers: {
              userId,
              emails: [email],
              phones: [],
              aliases: []
            },
            jurisdiction,
            requestedBy: {
              userId: 'admin-123',
              role: 'compliance_officer',
              organization: 'test-org'
            },
            legalProof: {
              type: 'SIGNED_REQUEST',
              evidence: 'test-evidence',
              verifiedAt: new Date().toISOString()
            }
          })

          // Get initial policy application
          const initialApplication = await policyManager.getPolicyApplication(result.workflowId)
          const initialSnapshot = JSON.stringify(initialApplication!.configSnapshot)

          // Update workflow multiple times
          await workflowStateManager.updateStepStatus(result.workflowId, 'stripe', 'DELETED')
          await workflowStateManager.updateStepStatus(result.workflowId, 'database', 'DELETED')
          await workflowStateManager.updateWorkflowState(result.workflowId, { status: 'COMPLETED' })

          // Get policy application again
          const finalApplication = await policyManager.getPolicyApplication(result.workflowId)
          const finalSnapshot = JSON.stringify(finalApplication!.configSnapshot)

          // Verify snapshot remained unchanged
          expect(finalSnapshot).toBe(initialSnapshot)
          expect(finalApplication!.policyVersion).toBe(initialApplication!.policyVersion)
          expect(finalApplication!.appliedAt).toBe(initialApplication!.appliedAt)
        }
      ),
      { numRuns: 50 }
    )
  })
})
