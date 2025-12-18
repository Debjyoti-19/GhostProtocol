/**
 * Property-based tests for audit clarity for exceptions
 * **Feature: gdpr-erasure-system, Property 28: Audit Clarity for Exceptions**
 * **Validates: Requirements 10.4, 10.5**
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { WorkflowStateManager } from '../../../src/gdpr/services/workflow-state-manager.js'
import { CertificateGenerator } from '../../../src/gdpr/services/certificate-generator.js'
import { AuditTrail } from '../../../src/gdpr/services/audit-trail.js'
import type { WorkflowState } from '../../../src/gdpr/types/index.js'

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

describe('Audit Clarity for Exceptions Properties', () => {
  let stateManager: MockStateManager
  let workflowStateManager: WorkflowStateManager

  beforeEach(() => {
    // Create fresh state manager for each test
    stateManager = new MockStateManager()
    workflowStateManager = new WorkflowStateManager(stateManager as any, mockLogger)
  })

  /**
   * Property 28: Audit Clarity for Exceptions
   * For any partially completed workflow, the audit trail should clearly distinguish between 
   * successful deletions and documented failures, providing remediation guidance
   */
  it('should clearly distinguish successful deletions from failures in audit trail', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.string({ minLength: 3, maxLength: 10 }),
          emails: fc.array(fc.emailAddress(), { minLength: 1, maxLength: 2 }),
          phones: fc.array(fc.string({ minLength: 10, maxLength: 15 }), { minLength: 0, maxLength: 1 }),
          aliases: fc.array(fc.string({ minLength: 3, maxLength: 8 }), { minLength: 0, maxLength: 1 })
        }), // userIdentifiers
        fc.integer({ min: 1, max: 3 }), // number of successful steps
        fc.integer({ min: 1, max: 3 }), // number of failed steps
        async (userIdentifiers, numSuccessful, numFailed) => {
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

          // Create audit trail
          const auditTrail = new AuditTrail(workflowId)
          auditTrail.appendEvent(AuditTrail.createEvent(
            workflowId,
            'WORKFLOW_CREATED',
            { userIdentifiers }
          ))

          // Add successful steps with audit events
          const successfulSteps: string[] = []
          for (let i = 0; i < numSuccessful; i++) {
            const stepName = `successful-step-${i}`
            successfulSteps.push(stepName)
            
            await workflowStateManager.updateStepStatus(
              workflowId,
              stepName,
              'DELETED',
              { 
                receipt: `success-receipt-${i}`, 
                apiResponse: { status: 'deleted', system: stepName } 
              }
            )

            auditTrail.appendEvent(AuditTrail.createEvent(
              workflowId,
              'STEP_COMPLETED',
              { 
                step: stepName, 
                status: 'DELETED',
                evidence: `success-receipt-${i}` 
              },
              { stepName, system: stepName }
            ))
          }

          // Add failed steps with audit events
          const failedSteps: string[] = []
          for (let i = 0; i < numFailed; i++) {
            const stepName = `failed-step-${i}`
            failedSteps.push(stepName)
            
            await workflowStateManager.updateStepStatus(
              workflowId,
              stepName,
              'FAILED',
              { 
                receipt: `failure-receipt-${i}`, 
                apiResponse: { 
                  status: 'error', 
                  error: `System ${stepName} permanently unavailable`,
                  system: stepName
                } 
              }
            )

            auditTrail.appendEvent(AuditTrail.createEvent(
              workflowId,
              'STEP_FAILED',
              { 
                step: stepName, 
                status: 'FAILED',
                error: `System ${stepName} permanently unavailable`,
                evidence: `failure-receipt-${i}` 
              },
              { stepName, system: stepName }
            ))
          }

          // Get audit entries
          const allEntries = auditTrail.getEntries()
          
          // Verify successful step events are clearly marked
          const successEvents = auditTrail.getEventsByType('STEP_COMPLETED')
          expect(successEvents.length).toBe(numSuccessful)
          
          successEvents.forEach(entry => {
            expect(entry.event.data.status).toBe('DELETED')
            expect(entry.event.data.evidence).toBeDefined()
            expect(entry.event.metadata?.stepName).toBeDefined()
          })

          // Verify failed step events are clearly marked
          const failureEvents = auditTrail.getEventsByType('STEP_FAILED')
          expect(failureEvents.length).toBe(numFailed)
          
          failureEvents.forEach(entry => {
            expect(entry.event.data.status).toBe('FAILED')
            expect(entry.event.data.error).toBeDefined()
            expect(entry.event.data.error).toContain('unavailable')
            expect(entry.event.metadata?.stepName).toBeDefined()
          })

          // Verify audit trail integrity
          expect(auditTrail.verifyIntegrity()).toBe(true)

          // Verify each step can be queried individually
          for (const stepName of successfulSteps) {
            const stepEvents = auditTrail.getStepEvents(stepName)
            expect(stepEvents.length).toBeGreaterThan(0)
            expect(stepEvents[0].event.eventType).toBe('STEP_COMPLETED')
          }

          for (const stepName of failedSteps) {
            const stepEvents = auditTrail.getStepEvents(stepName)
            expect(stepEvents.length).toBeGreaterThan(0)
            expect(stepEvents[0].event.eventType).toBe('STEP_FAILED')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should provide remediation guidance in certificates for failed steps', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.string({ minLength: 3, maxLength: 10 }),
          emails: fc.array(fc.emailAddress(), { minLength: 1, maxLength: 2 }),
          phones: fc.array(fc.string({ minLength: 10, maxLength: 15 }), { minLength: 0, maxLength: 1 }),
          aliases: fc.array(fc.string({ minLength: 3, maxLength: 8 }), { minLength: 0, maxLength: 1 })
        }), // userIdentifiers
        fc.array(
          fc.record({
            system: fc.string({ minLength: 3, maxLength: 15 }),
            errorType: fc.constantFrom('timeout', 'unavailable', 'auth_failed', 'rate_limited')
          }),
          { minLength: 1, maxLength: 3 }
        ), // failed systems with error types
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

          // Add a successful step
          await workflowStateManager.updateStepStatus(
            workflowId,
            'stripe-deletion',
            'DELETED',
            { receipt: 'stripe-success' }
          )

          // Add failed steps with different error types
          for (const { system, errorType } of failedSystems) {
            await workflowStateManager.updateStepStatus(
              workflowId,
              system,
              'FAILED',
              { 
                receipt: `${system}-failure`, 
                apiResponse: { 
                  status: 'error', 
                  errorType,
                  error: `${system} failed: ${errorType}`,
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
              evidence: { 
                failedSystems: failedSystems.map(f => f.system),
                remediationRequired: true
              }
            }
          )

          // Get final workflow state
          const finalState = await workflowStateManager.getWorkflowState(workflowId)
          expect(finalState).toBeDefined()

          // Create audit trail
          const auditTrail = new AuditTrail(workflowId)
          auditTrail.appendEvent(AuditTrail.createEvent(workflowId, 'WORKFLOW_CREATED', { userIdentifiers }))
          auditTrail.appendEvent(AuditTrail.createEvent(workflowId, 'STEP_COMPLETED', { step: 'stripe-deletion' }))
          
          for (const { system, errorType } of failedSystems) {
            auditTrail.appendEvent(AuditTrail.createEvent(
              workflowId,
              'STEP_FAILED',
              { 
                step: system, 
                errorType,
                error: `${system} failed: ${errorType}`,
                remediationGuidance: `Manual intervention required for ${system} due to ${errorType}`
              }
            ))
          }

          // Generate certificate
          const certificate = CertificateGenerator.generateCertificate({
            workflowState: finalState!,
            auditTrail,
            redactUserIdentifiers: true
          })

          // Verify certificate contains clear status
          expect(certificate.status).toBe('COMPLETED_WITH_EXCEPTIONS')

          // Verify each failed system is documented with evidence
          for (const { system } of failedSystems) {
            const receipt = certificate.systemReceipts.find(r => r.system === system)
            expect(receipt).toBeDefined()
            expect(receipt!.status).toBe('FAILED')
            expect(receipt!.evidence).toBeDefined()
            expect(receipt!.timestamp).toBeDefined()
            
            // Evidence should contain failure information
            expect(receipt!.evidence.length).toBeGreaterThan(0)
          }

          // Verify successful steps are also clearly documented
          const successReceipt = certificate.systemReceipts.find(r => r.system === 'stripe-deletion')
          expect(successReceipt).toBeDefined()
          expect(successReceipt!.status).toBe('DELETED')
          expect(successReceipt!.evidence).toBeDefined()

          // Verify certificate validation passes
          const validation = CertificateGenerator.validateCertificate(certificate)
          expect(validation.valid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should maintain clear audit trail even with mixed success and failure states', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.string({ minLength: 3, maxLength: 10 }),
          emails: fc.array(fc.emailAddress(), { minLength: 1, maxLength: 2 }),
          phones: fc.array(fc.string({ minLength: 10, maxLength: 15 }), { minLength: 0, maxLength: 1 }),
          aliases: fc.array(fc.string({ minLength: 3, maxLength: 8 }), { minLength: 0, maxLength: 1 })
        }), // userIdentifiers
        fc.array(
          fc.record({
            stepName: fc.string({ minLength: 3, maxLength: 15 }),
            willSucceed: fc.boolean()
          }),
          { minLength: 2, maxLength: 5 }
        ), // steps with success/failure flags
        async (userIdentifiers, steps) => {
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

          // Create audit trail
          const auditTrail = new AuditTrail(workflowId)
          auditTrail.appendEvent(AuditTrail.createEvent(workflowId, 'WORKFLOW_CREATED', { userIdentifiers }))

          let successCount = 0
          let failureCount = 0

          // Process each step
          for (const { stepName, willSucceed } of steps) {
            if (willSucceed) {
              await workflowStateManager.updateStepStatus(
                workflowId,
                stepName,
                'DELETED',
                { receipt: `${stepName}-success` }
              )

              auditTrail.appendEvent(AuditTrail.createEvent(
                workflowId,
                'STEP_COMPLETED',
                { step: stepName, status: 'DELETED' },
                { stepName }
              ))

              successCount++
            } else {
              await workflowStateManager.updateStepStatus(
                workflowId,
                stepName,
                'FAILED',
                { 
                  receipt: `${stepName}-failure`,
                  apiResponse: { error: `${stepName} failed` }
                }
              )

              auditTrail.appendEvent(AuditTrail.createEvent(
                workflowId,
                'STEP_FAILED',
                { step: stepName, status: 'FAILED', error: `${stepName} failed` },
                { stepName }
              ))

              failureCount++
            }
          }

          // Verify audit trail has correct event counts
          const completedEvents = auditTrail.getEventsByType('STEP_COMPLETED')
          const failedEvents = auditTrail.getEventsByType('STEP_FAILED')

          expect(completedEvents.length).toBe(successCount)
          expect(failedEvents.length).toBe(failureCount)

          // Verify audit trail integrity
          expect(auditTrail.verifyIntegrity()).toBe(true)

          // Verify each step type is clearly distinguishable
          completedEvents.forEach(entry => {
            expect(entry.event.data.status).toBe('DELETED')
            expect(entry.event.eventType).toBe('STEP_COMPLETED')
          })

          failedEvents.forEach(entry => {
            expect(entry.event.data.status).toBe('FAILED')
            expect(entry.event.eventType).toBe('STEP_FAILED')
            expect(entry.event.data.error).toBeDefined()
          })

          // Get final workflow state
          const finalState = await workflowStateManager.getWorkflowState(workflowId)
          expect(finalState).toBeDefined()

          // Verify workflow state reflects the mixed results
          for (const { stepName, willSucceed } of steps) {
            const step = finalState!.steps[stepName]
            expect(step).toBeDefined()
            expect(step.status).toBe(willSucceed ? 'DELETED' : 'FAILED')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should provide certificate summaries that clearly show completion status', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.string({ minLength: 3, maxLength: 10 }),
          emails: fc.array(fc.emailAddress(), { minLength: 1, maxLength: 2 }),
          phones: fc.array(fc.string({ minLength: 10, maxLength: 15 }), { minLength: 0, maxLength: 1 }),
          aliases: fc.array(fc.string({ minLength: 3, maxLength: 8 }), { minLength: 0, maxLength: 1 })
        }), // userIdentifiers
        fc.integer({ min: 0, max: 3 }), // number of failed steps
        async (userIdentifiers, numFailed) => {
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

          // Add failed steps
          for (let i = 0; i < numFailed; i++) {
            await workflowStateManager.updateStepStatus(
              workflowId,
              `failed-system-${i}`,
              'FAILED',
              { receipt: `failure-${i}`, apiResponse: { error: 'System unavailable' } }
            )
          }

          // Update workflow status
          const finalStatus = numFailed > 0 ? 'COMPLETED_WITH_EXCEPTIONS' : 'COMPLETED'
          await workflowStateManager.updateWorkflowState(
            workflowId,
            { status: finalStatus }
          )

          // Get final workflow state
          const finalState = await workflowStateManager.getWorkflowState(workflowId)
          expect(finalState).toBeDefined()

          // Create audit trail
          const auditTrail = new AuditTrail(workflowId)
          auditTrail.appendEvent(AuditTrail.createEvent(workflowId, 'WORKFLOW_CREATED', { userIdentifiers }))

          // Generate certificate
          const certificate = CertificateGenerator.generateCertificate({
            workflowState: finalState!,
            auditTrail,
            redactUserIdentifiers: true
          })

          // Get certificate summary
          const summary = CertificateGenerator.getCertificateSummary(certificate)

          // Verify summary clearly shows status
          expect(summary.status).toBe(finalStatus)
          expect(summary.systemsProcessed).toBeGreaterThan(0)
          expect(summary.systemsDeleted).toBeGreaterThanOrEqual(2) // At least stripe and database
          
          if (numFailed > 0) {
            expect(summary.systemsFailed).toBeGreaterThan(0)
            expect(summary.status).toBe('COMPLETED_WITH_EXCEPTIONS')
          } else {
            expect(summary.status).toBe('COMPLETED')
          }

          // Verify summary provides clear metrics
          expect(summary.certificateId).toBeDefined()
          expect(summary.workflowId).toBe(workflowId)
          expect(summary.completedAt).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )
  })
})
