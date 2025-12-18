/**
 * Property-Based Tests for Jurisdiction-Based Policy Application
 * 
 * **Feature: gdpr-erasure-system, Property 29: Jurisdiction-Based Policy Application**
 * **Validates: Requirements 11.1, 11.2**
 * 
 * Property 29: Jurisdiction-Based Policy Application
 * For any workflow, the system should apply the correct policy configuration based on 
 * user jurisdiction and enforce region-specific deletion rules
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { PolicyManager } from '../../../src/gdpr/services/policy-manager.js'
import { WorkflowStateManager } from '../../../src/gdpr/services/workflow-state-manager.js'
import type { Jurisdiction } from '../../../src/gdpr/types/index.js'

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

describe('Property 29: Jurisdiction-Based Policy Application', () => {
  let state: MockStateManager
  let policyManager: PolicyManager
  let workflowStateManager: WorkflowStateManager

  beforeEach(() => {
    state = new MockStateManager()
    policyManager = new PolicyManager(state as any, mockLogger)
    workflowStateManager = new WorkflowStateManager(state as any, mockLogger)
  })

  /**
   * Property: For any jurisdiction, the system should return a valid policy configuration
   */
  it('should return valid policy for any jurisdiction', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        async (jurisdiction) => {
          // Get policy for jurisdiction
          const policy = await policyManager.getPolicyForJurisdiction(jurisdiction)

          // Verify policy matches jurisdiction
          expect(policy.jurisdiction).toBe(jurisdiction)
          
          // Verify policy has required fields
          expect(policy.version).toBeDefined()
          expect(policy.retentionRules).toBeDefined()
          expect(policy.legalHoldRules).toBeDefined()
          expect(policy.zombieCheckInterval).toBeGreaterThan(0)
          expect(policy.confidenceThresholds).toBeDefined()
          expect(policy.confidenceThresholds.autoDelete).toBeGreaterThanOrEqual(
            policy.confidenceThresholds.manualReview
          )

          // Verify all required systems have retention rules
          const requiredSystems = ['stripe', 'database', 'intercom', 'sendgrid', 'crm', 'analytics']
          const configuredSystems = new Set(policy.retentionRules.map(r => r.system))
          
          for (const system of requiredSystems) {
            expect(configuredSystems.has(system)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: For any jurisdiction, retention rules should be properly ordered by priority
   */
  it('should enforce region-specific deletion rules with proper priorities', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        async (jurisdiction) => {
          // Get policy for jurisdiction
          const policy = await policyManager.getPolicyForJurisdiction(jurisdiction)

          // Verify retention rules have valid priorities
          for (const rule of policy.retentionRules) {
            expect(rule.priority).toBeGreaterThan(0)
            expect(rule.retentionDays).toBeGreaterThanOrEqual(0)
          }

          // Verify identity-critical systems (stripe, database) have highest priorities
          const stripeRule = policy.retentionRules.find(r => r.system === 'stripe')
          const databaseRule = policy.retentionRules.find(r => r.system === 'database')
          
          expect(stripeRule).toBeDefined()
          expect(databaseRule).toBeDefined()
          
          // Stripe should have priority 1 or 2
          expect(stripeRule!.priority).toBeLessThanOrEqual(2)
          // Database should have priority 1 or 2
          expect(databaseRule!.priority).toBeLessThanOrEqual(2)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: For any jurisdiction, different regions should have different retention policies
   */
  it('should apply different retention rules based on jurisdiction', async () => {
    // Get policies for all jurisdictions
    const euPolicy = await policyManager.getPolicyForJurisdiction('EU')
    const usPolicy = await policyManager.getPolicyForJurisdiction('US')
    const otherPolicy = await policyManager.getPolicyForJurisdiction('OTHER')

    // EU should have strictest rules (GDPR)
    const euStripeRetention = euPolicy.retentionRules.find(r => r.system === 'stripe')!.retentionDays
    const usStripeRetention = usPolicy.retentionRules.find(r => r.system === 'stripe')!.retentionDays
    const otherStripeRetention = otherPolicy.retentionRules.find(r => r.system === 'stripe')!.retentionDays

    // EU should have shortest or equal retention
    expect(euStripeRetention).toBeLessThanOrEqual(usStripeRetention)
    expect(euStripeRetention).toBeLessThanOrEqual(otherStripeRetention)

    // Zombie check intervals should differ
    expect(euPolicy.zombieCheckInterval).not.toBe(usPolicy.zombieCheckInterval)
    
    // Confidence thresholds should differ
    expect(euPolicy.confidenceThresholds.autoDelete).not.toBe(usPolicy.confidenceThresholds.autoDelete)
  })

  /**
   * Property: For any workflow created with a jurisdiction, the correct policy should be applied
   */
  it('should apply correct policy when creating workflows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        fc.uuid(),
        fc.emailAddress(),
        async (jurisdiction, userId, email) => {
          // Create workflow with jurisdiction
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

          // Get expected policy for jurisdiction
          const expectedPolicy = await policyManager.getPolicyForJurisdiction(jurisdiction)

          // Verify workflow has correct policy version
          expect(result.workflowState.policyVersion).toBe(expectedPolicy.version)

          // Verify policy application was recorded
          const policyApplication = await policyManager.getPolicyApplication(result.workflowId)
          expect(policyApplication).toBeDefined()
          expect(policyApplication!.jurisdiction).toBe(jurisdiction)
          expect(policyApplication!.policyVersion).toBe(expectedPolicy.version)
          expect(policyApplication!.configSnapshot.jurisdiction).toBe(jurisdiction)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: For any system and jurisdiction, retention rules should be retrievable
   */
  it('should retrieve system-specific retention rules for any jurisdiction', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        fc.constantFrom('stripe', 'database', 'intercom', 'sendgrid', 'crm', 'analytics'),
        async (jurisdiction, system) => {
          // Get retention rules for system
          const rule = await policyManager.getRetentionRulesForSystem(system, jurisdiction)

          // Verify rule exists and is valid
          expect(rule).toBeDefined()
          expect(rule!.system).toBe(system)
          expect(rule!.retentionDays).toBeGreaterThanOrEqual(0)
          expect(rule!.priority).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: For any jurisdiction, confidence thresholds should be properly ordered
   */
  it('should enforce proper confidence threshold ordering for any jurisdiction', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        async (jurisdiction) => {
          // Get confidence thresholds
          const thresholds = await policyManager.getConfidenceThresholds(jurisdiction)

          // Verify auto-delete threshold is higher than manual review
          expect(thresholds.autoDelete).toBeGreaterThanOrEqual(thresholds.manualReview)
          
          // Verify thresholds are in valid range
          expect(thresholds.autoDelete).toBeGreaterThanOrEqual(0)
          expect(thresholds.autoDelete).toBeLessThanOrEqual(1)
          expect(thresholds.manualReview).toBeGreaterThanOrEqual(0)
          expect(thresholds.manualReview).toBeLessThanOrEqual(1)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: For any jurisdiction, zombie check interval should be positive
   */
  it('should return valid zombie check interval for any jurisdiction', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Jurisdiction>('EU', 'US', 'OTHER'),
        async (jurisdiction) => {
          // Get zombie check interval
          const interval = await policyManager.getZombieCheckInterval(jurisdiction)

          // Verify interval is positive
          expect(interval).toBeGreaterThan(0)
          
          // Verify interval is reasonable (between 1 and 365 days)
          expect(interval).toBeGreaterThanOrEqual(1)
          expect(interval).toBeLessThanOrEqual(365)
        }
      ),
      { numRuns: 100 }
    )
  })
})
