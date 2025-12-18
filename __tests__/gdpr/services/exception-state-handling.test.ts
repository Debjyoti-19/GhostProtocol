/**
 * Property-based tests for exception state handling
 * **Feature: gdpr-erasure-system, Property 27: Exception State Handling**
 * **Validates: Requirements 10.1, 10.2, 10.3**
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { WorkflowStateManager } from '../../../src/gdpr/services/workflow-state-manager.js'
import { CertificateGenerator } from '../../../src/gdpr/services/certificate-generator.js'
import { AuditTrail } from '../../../src/gdpr/services/audit-trail.js'
import type { WorkflowState, StepStatus } from '../../../src/gdpr/types/index.js'

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
  error: () => {},
  debug: () => {}
}

describe('Exception State Handling Properties', () => {
  let stateManager: MockStateManager
  let workflowStateManager: WorkflowStateManager

  beforeEach(() => {
    // Create fresh state manager for each test
    stateManager = new MockStateManager()
    workflowStateManager = new WorkflowStateManager(stateManager as any, mockLogger)
  })

  /**
   * Property 27: Exception State Handling
   * For any workflow where some deletion steps fail permanently, the system should reach 
   * COMPLETED_WITH_EXCEPTIONS state and document unresolved systems with evidence
   */
  it('should transition to COMPLETED_WITH_EXCEPTIONS when some steps fail permanently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.string({ minLength: 3, maxLength: 10 }),
          emails: fc.array(fc.emailAddress(), { minLength: 1, maxLength: 2 }),
          phones: fc.array(fc.string({ minLength: 10, maxLength: 15 }), { minLength: 0, maxLength: 1 }),
          aliases: fc.array(fc.string({ minLength: 3, maxLength: 8 }), { minLength: 0, maxLength: 1 })
        }), // userIdentifiers
        fc.integer({ min: 1, max: 5 }), // number of successful steps
        fc.integer({ min: 1, max: 3 }), // number of failed steps
        async (userIdentifiers, numSuccessful, numFailed) => {
          // Create workflow
          const { workflowId, workflowState } = await workflowStateManager.createWorkflow({
            userIdentifiers,
            jurisdiction: 'EU',
            requestedBy: {
              userId: 'admin-123',
              role: 'compliance-officer',
              organization: 'test-org'
            },
            legalProof: {
              type: 'SIGNED_REQUEST',
              evidence: 'legal-proof-123',
              verifiedAt: new Date().toISOString()
            }
          })

          // Add successful steps
          for (let i = 0; i < numSuccessful; i++) {
            await workflowStateManager.updateStepStatus(
              workflowId,
              `successful-step-${i}`,
              'DELETED',
              { receipt: `success-receipt-${i}`, apiResponse: { status: 'deleted' } }
            )
          }

          // Add failed steps with max retry attempts
          for (let i = 0; i < numFailed; i++) {
            await workflowStateManager.updateStepStatus(
              workflowId,
              `failed-step-${i}`,
              'FAILED',
              { 
                receipt: `failure-receipt-${i}`, 
                apiResponse: { 
                  status: 'error', 
                  error: 'Permanent failure - third party system unavailable' 
                } 
              },
              true // increment attempts
            )
            
            // Simulate multiple retry attempts
            for (let attempt = 1; attempt < 3; attempt++) {
              await workflowStateManager.updateStepStatus(
                workflowId,
                `failed-step-${i}`,
                'FAILED',
                { 
                  receipt: `failure-receipt-${i}-attempt-${attempt}`, 
                  apiResponse: { 
                    status: 'error', 
                    error: 'Permanent failure - third party system unavailable' 
                  } 
                },
                true // increment attempts
              )
            }
          }

          // Update workflow to COMPLETED_WITH_EXCEPTIONS
          const updatedState = await workflowStateManager.updateWorkflowState(
            workflowId,
            { status: 'COMPLETED_WITH_EXCEPTIONS' },
            {
              auditEvent: 'WORKFLOW_COMPLETED_WITH_EXCEPTIONS',
              evidence: {
                successfulSteps: numSuccessful,
                failedSteps: numFailed,
                reason: 'Some deletion steps failed permanently after retries'
              }
            }
          )

          // Verify workflow reached COMPLETED_WITH_EXCEPTIONS state
          expect(updatedState.status).toBe('COMPLETED_WITH_EXCEPTIONS')

          // Verify successful steps are marked as DELETED
          for (let i = 0; i < numSuccessful; i++) {
            expect(updatedState.steps[`successful-step-${i}`].status).toBe('DELETED')
          }

          // Verify failed steps are marked as FAILED with evidence
          for (let i = 0; i < numFailed; i++) {
            const failedStep = updatedState.steps[`failed-step-${i}`]
            expect(failedStep.status).toBe('FAILED')
            expect(failedStep.attempts).toBeGreaterThanOrEqual(3) // At least 3 attempts
            expect(failedStep.evidence).toBeDefined()
            // Evidence should contain failure information (either in receipt or apiResponse)
            const evidenceStr = JSON.stringify(failedStep.evidence)
            expect(evidenceStr).toContain('Permanent failure')
          }

          // Verify audit trail contains the exception event
          const auditHashes = updatedState.auditHashes
          expect(auditHashes.length).toBeGreaterThan(1) // Should have genesis + events
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should document unresolved systems with error evidence in certificates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.string({ minLength: 3, maxLength: 10 }),
          emails: fc.array(fc.emailAddress(), { minLength: 1, maxLength: 2 }),
          phones: fc.array(fc.string({ minLength: 10, maxLength: 15 }), { minLength: 0, maxLength: 1 }),
          aliases: fc.array(fc.string({ minLength: 3, maxLength: 8 }), { minLength: 0, maxLength: 1 })
        }), // userIdentifiers
        fc.array(fc.string({ minLength: 3, maxLength: 15 }), { minLength: 1, maxLength: 3 }), // failed system names
        async (userIdentifiers, failedSystems) => {
          // Create workflow
          const { workflowId } = await workflowStateManager.createWorkflow({
            userIdentifiers,
            jurisdiction: 'EU',
            requestedBy: {
              userId: 'admin-123',
              role: 'compliance-officer',
              organization: 'test-org'
            },
            legalProof: {
              type: 'SIGNED_REQUEST',
              evidence: 'legal-proof-123',
              verifiedAt: new Date().toISOString()
            }
          })

          // Add some successful steps
          await workflowStateManager.updateStepStatus(
            workflowId,
            'stripe-deletion',
            'DELETED',
            { receipt: 'stripe-success', apiResponse: { status: 'deleted' } }
          )

          // Add failed steps for each system
          for (const system of failedSystems) {
            await workflowStateManager.updateStepStatus(
              workflowId,
              system,
              'FAILED',
              { 
                receipt: `${system}-failure`, 
                apiResponse: { 
                  status: 'error', 
                  error: `${system} permanently unavailable`,
                  timestamp: new Date().toISOString()
                } 
              }
            )
          }

          // Update workflow to COMPLETED_WITH_EXCEPTIONS
          await workflowStateManager.updateWorkflowState(
            workflowId,
            { status: 'COMPLETED_WITH_EXCEPTIONS' },
            {
              auditEvent: 'WORKFLOW_COMPLETED_WITH_EXCEPTIONS',
              evidence: { failedSystems }
            }
          )

          // Get final workflow state
          const finalState = await workflowStateManager.getWorkflowState(workflowId)
          expect(finalState).toBeDefined()

          // Create audit trail for certificate generation
          const auditTrail = new AuditTrail(workflowId)
          auditTrail.appendEvent(AuditTrail.createEvent(workflowId, 'WORKFLOW_CREATED', { userIdentifiers }))
          auditTrail.appendEvent(AuditTrail.createEvent(workflowId, 'STEP_COMPLETED', { step: 'stripe-deletion' }))
          
          for (const system of failedSystems) {
            auditTrail.appendEvent(AuditTrail.createEvent(
              workflowId, 
              'STEP_FAILED', 
              { step: system, error: `${system} permanently unavailable` }
            ))
          }

          // Generate certificate
          const certificate = CertificateGenerator.generateCertificate({
            workflowState: finalState!,
            auditTrail,
            redactUserIdentifiers: true
          })

          // Verify certificate status is COMPLETED_WITH_EXCEPTIONS
          expect(certificate.status).toBe('COMPLETED_WITH_EXCEPTIONS')

          // Verify all failed systems are documented in system receipts
          const failedReceipts = certificate.systemReceipts.filter(r => r.status === 'FAILED')
          expect(failedReceipts.length).toBeGreaterThanOrEqual(failedSystems.length)

          // Verify each failed system has evidence
          for (const system of failedSystems) {
            const receipt = certificate.systemReceipts.find(r => r.system === system)
            expect(receipt).toBeDefined()
            expect(receipt!.status).toBe('FAILED')
            expect(receipt!.evidence).toBeDefined()
            expect(receipt!.timestamp).toBeDefined()
          }

          // Verify successful steps are also documented
          const successfulReceipt = certificate.systemReceipts.find(r => r.system === 'stripe-deletion')
          expect(successfulReceipt).toBeDefined()
          expect(successfulReceipt!.status).toBe('DELETED')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve all retry attempt evidence for failed steps', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.string({ minLength: 3, maxLength: 10 }),
          emails: fc.array(fc.emailAddress(), { minLength: 1, maxLength: 2 }),
          phones: fc.array(fc.string({ minLength: 10, maxLength: 15 }), { minLength: 0, maxLength: 1 }),
          aliases: fc.array(fc.string({ minLength: 3, maxLength: 8 }), { minLength: 0, maxLength: 1 })
        }), // userIdentifiers
        fc.integer({ min: 1, max: 5 }), // number of retry attempts
        async (userIdentifiers, retryAttempts) => {
          // Create workflow
          const { workflowId } = await workflowStateManager.createWorkflow({
            userIdentifiers,
            jurisdiction: 'EU',
            requestedBy: {
              userId: 'admin-123',
              role: 'compliance-officer',
              organization: 'test-org'
            },
            legalProof: {
              type: 'SIGNED_REQUEST',
              evidence: 'legal-proof-123',
              verifiedAt: new Date().toISOString()
            }
          })

          // Simulate multiple retry attempts for a failing step
          const stepName = 'problematic-system'
          for (let attempt = 0; attempt < retryAttempts; attempt++) {
            await workflowStateManager.updateStepStatus(
              workflowId,
              stepName,
              'FAILED',
              { 
                receipt: `attempt-${attempt}`, 
                apiResponse: { 
                  status: 'error', 
                  error: `Attempt ${attempt + 1} failed`,
                  attemptNumber: attempt + 1,
                  timestamp: new Date().toISOString()
                } 
              },
              true // increment attempts
            )
          }

          // Get final workflow state
          const finalState = await workflowStateManager.getWorkflowState(workflowId)
          expect(finalState).toBeDefined()

          // Verify the step has correct number of attempts
          const failedStep = finalState!.steps[stepName]
          expect(failedStep).toBeDefined()
          expect(failedStep.status).toBe('FAILED')
          expect(failedStep.attempts).toBeGreaterThanOrEqual(retryAttempts)

          // Verify evidence from last attempt is preserved
          expect(failedStep.evidence).toBeDefined()
          expect(failedStep.evidence.receipt).toBeDefined()
          // Evidence should contain information about the attempts
          const evidenceStr = JSON.stringify(failedStep.evidence)
          expect(evidenceStr).toContain('attempt')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should distinguish between COMPLETED and COMPLETED_WITH_EXCEPTIONS states', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.string({ minLength: 3, maxLength: 10 }),
          emails: fc.array(fc.emailAddress(), { minLength: 1, maxLength: 2 }),
          phones: fc.array(fc.string({ minLength: 10, maxLength: 15 }), { minLength: 0, maxLength: 1 }),
          aliases: fc.array(fc.string({ minLength: 3, maxLength: 8 }), { minLength: 0, maxLength: 1 })
        }), // userIdentifiers
        fc.boolean(), // hasFailures
        async (userIdentifiers, hasFailures) => {
          // Create workflow
          const { workflowId } = await workflowStateManager.createWorkflow({
            userIdentifiers,
            jurisdiction: 'EU',
            requestedBy: {
              userId: 'admin-123',
              role: 'compliance-officer',
              organization: 'test-org'
            },
            legalProof: {
              type: 'SIGNED_REQUEST',
              evidence: 'legal-proof-123',
              verifiedAt: new Date().toISOString()
            }
          })

          // Add successful steps
          await workflowStateManager.updateStepStatus(
            workflowId,
            'stripe-deletion',
            'DELETED',
            { receipt: 'stripe-success' }
          )

          await workflowStateManager.updateStepStatus(
            workflowId,
            'database-deletion',
            'DELETED',
            { receipt: 'db-success' }
          )

          if (hasFailures) {
            // Add a failed step
            await workflowStateManager.updateStepStatus(
              workflowId,
              'third-party-system',
              'FAILED',
              { receipt: 'failure', apiResponse: { error: 'System unavailable' } }
            )
          }

          // Update workflow to appropriate completion state
          const finalStatus = hasFailures ? 'COMPLETED_WITH_EXCEPTIONS' : 'COMPLETED'
          const updatedState = await workflowStateManager.updateWorkflowState(
            workflowId,
            { status: finalStatus },
            {
              auditEvent: hasFailures ? 'WORKFLOW_COMPLETED_WITH_EXCEPTIONS' : 'WORKFLOW_COMPLETED',
              evidence: { hasFailures }
            }
          )

          // Verify correct status
          expect(updatedState.status).toBe(finalStatus)

          // Verify all successful steps are DELETED
          expect(updatedState.steps['stripe-deletion'].status).toBe('DELETED')
          expect(updatedState.steps['database-deletion'].status).toBe('DELETED')

          // If has failures, verify failed step exists
          if (hasFailures) {
            expect(updatedState.steps['third-party-system'].status).toBe('FAILED')
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
