/**
 * Property-based tests for certificate generation
 * **Feature: gdpr-erasure-system, Property 18: Certificate Generation**
 * **Validates: Requirements 6.3, 6.4, 6.6**
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { CertificateGenerator } from '../../../src/gdpr/services/certificate-generator.js'
import { AuditTrail } from '../../../src/gdpr/services/audit-trail.js'
import type { WorkflowState } from '../../../src/gdpr/types/index.js'

describe('Certificate Generation Properties', () => {

  /**
   * Property 18: Certificate Generation
   * For any successfully completed workflow, the system should generate a Certificate of Destruction 
   * containing workflow ID, redacted identifiers, system receipts, signed hash roots, and data lineage snapshot
   */
  it('should generate complete certificates with all required fields for any completed workflow', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }), // workflowId
        fc.record({
          userId: fc.string({ minLength: 3, maxLength: 10 }),
          emails: fc.array(fc.emailAddress(), { minLength: 1, maxLength: 2 }),
          phones: fc.array(fc.string({ minLength: 10, maxLength: 15 }), { minLength: 0, maxLength: 1 }),
          aliases: fc.array(fc.string({ minLength: 3, maxLength: 8 }), { minLength: 0, maxLength: 1 })
        }), // userIdentifiers
        fc.constantFrom('COMPLETED', 'COMPLETED_WITH_EXCEPTIONS'), // status
        (workflowId, userIdentifiers, status) => {
          // Create simple workflow state
          const workflowState: WorkflowState = {
            workflowId,
            userIdentifiers,
            status,
            policyVersion: 'v1.0',
            legalHolds: [],
            steps: {
              'stripe-deletion': {
                status: 'DELETED',
                attempts: 1,
                evidence: {
                  receipt: 'stripe-receipt-123',
                  timestamp: new Date().toISOString()
                }
              }
            },
            backgroundJobs: {},
            auditHashes: [],
            dataLineageSnapshot: {
              systems: ['stripe'],
              identifiers: [userIdentifiers.userId],
              capturedAt: new Date().toISOString()
            }
          }

          // Create audit trail with some events
          const auditTrail = new AuditTrail(workflowId)
          auditTrail.appendEvent(AuditTrail.createEvent(workflowId, 'WORKFLOW_CREATED', { userIdentifiers }))

          // Generate certificate
          const certificate = CertificateGenerator.generateCertificate({
            workflowState,
            auditTrail,
            redactUserIdentifiers: true
          })

          // Verify required fields are present
          expect(certificate.certificateId).toBeDefined()
          expect(typeof certificate.certificateId).toBe('string')
          expect(certificate.certificateId.length).toBeGreaterThan(0)

          expect(certificate.workflowId).toBe(workflowId)
          expect(certificate.status).toBe(status)
          expect(certificate.policyVersion).toBe('v1.0')
          expect(certificate.signature).toBeDefined()
          expect(typeof certificate.signature).toBe('string')
          expect(certificate.signature.length).toBeGreaterThan(0)

          // Verify audit hash root is included
          expect(certificate.auditHashRoot).toBe(auditTrail.getHashRoot())

          // Verify data lineage snapshot is embedded
          expect(certificate.dataLineageSnapshot).toEqual(workflowState.dataLineageSnapshot)

          // Verify system receipts are created from steps
          expect(certificate.systemReceipts.length).toBe(1)
          expect(certificate.systemReceipts[0].system).toBe('stripe-deletion')
          expect(certificate.systemReceipts[0].status).toBe('DELETED')

          // Verify user identifiers are redacted
          expect(certificate.userIdentifiers.userId).not.toBe(userIdentifiers.userId)
          expect(certificate.userIdentifiers.userId).toContain('***')
          
          certificate.userIdentifiers.emails.forEach((redactedEmail, index) => {
            expect(redactedEmail).not.toBe(userIdentifiers.emails[index])
            expect(redactedEmail).toContain('***')
            // Should preserve domain
            const originalDomain = userIdentifiers.emails[index].split('@')[1]
            expect(redactedEmail).toContain(`@${originalDomain}`)
          })
        }
      ),
      { numRuns: 20 }
    )
  })

  it('should create valid certificates that pass validation checks', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }), // workflowId
        fc.record({
          userId: fc.string({ minLength: 3, maxLength: 10 }),
          emails: fc.array(fc.emailAddress(), { minLength: 1, maxLength: 2 }),
          phones: fc.array(fc.string({ minLength: 10, maxLength: 15 }), { minLength: 0, maxLength: 1 }),
          aliases: fc.array(fc.string({ minLength: 3, maxLength: 8 }), { minLength: 0, maxLength: 1 })
        }), // userIdentifiers
        (workflowId, userIdentifiers) => {
          const workflowState: WorkflowState = {
            workflowId,
            userIdentifiers,
            status: 'COMPLETED',
            policyVersion: 'v1.0',
            legalHolds: [],
            steps: {
              'test-step': {
                status: 'DELETED',
                attempts: 1,
                evidence: {
                  receipt: 'test-receipt',
                  timestamp: new Date().toISOString()
                }
              }
            },
            backgroundJobs: {},
            auditHashes: [],
            dataLineageSnapshot: {
              systems: ['test'],
              identifiers: [userIdentifiers.userId],
              capturedAt: new Date().toISOString()
            }
          }

          const auditTrail = new AuditTrail(workflowId)
          auditTrail.appendEvent(AuditTrail.createEvent(workflowId, 'WORKFLOW_CREATED', {}))

          const certificate = CertificateGenerator.generateCertificate({
            workflowState,
            auditTrail
          })

          // Validate certificate
          const validation = CertificateGenerator.validateCertificate(certificate)
          expect(validation.valid).toBe(true)
          expect(validation.errors).toEqual([])
        }
      ),
      { numRuns: 20 }
    )
  })

  it('should generate certificates with verifiable signatures', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }), // workflowId
        (workflowId) => {
          const workflowState: WorkflowState = {
            workflowId,
            userIdentifiers: {
              userId: 'test-user',
              emails: ['test@example.com'],
              phones: [],
              aliases: []
            },
            status: 'COMPLETED',
            policyVersion: 'v1.0',
            legalHolds: [],
            steps: {
              'stripe-deletion': {
                status: 'DELETED',
                attempts: 1,
                evidence: {
                  receipt: 'stripe-receipt-123',
                  timestamp: new Date().toISOString()
                }
              }
            },
            backgroundJobs: {},
            auditHashes: [],
            dataLineageSnapshot: {
              systems: ['stripe'],
              identifiers: ['test-user'],
              capturedAt: new Date().toISOString()
            }
          }

          const auditTrail = new AuditTrail(workflowId)
          auditTrail.appendEvent(AuditTrail.createEvent(workflowId, 'WORKFLOW_CREATED', {}))

          const certificate = CertificateGenerator.generateCertificate({
            workflowState,
            auditTrail
          })

          // Verify signature
          const isValid = CertificateGenerator.verifyCertificate(certificate)
          expect(isValid).toBe(true)

          // Verify tampering detection - modify certificate and check signature fails
          const tamperedCertificate = {
            ...certificate,
            status: 'COMPLETED_WITH_EXCEPTIONS' as const
          }

          const isTamperedValid = CertificateGenerator.verifyCertificate(tamperedCertificate)
          expect(isTamperedValid).toBe(false)
        }
      ),
      { numRuns: 20 }
    )
  })

  it('should reject certificate generation when audit trail integrity is compromised', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }), // workflowId
        (workflowId) => {
          const workflowState: WorkflowState = {
            workflowId,
            userIdentifiers: {
              userId: 'test-user',
              emails: ['test@example.com'],
              phones: [],
              aliases: []
            },
            status: 'COMPLETED',
            policyVersion: 'v1.0',
            legalHolds: [],
            steps: {
              'test-step': {
                status: 'DELETED',
                attempts: 1,
                evidence: {
                  timestamp: new Date().toISOString()
                }
              }
            },
            backgroundJobs: {},
            auditHashes: [],
            dataLineageSnapshot: {
              systems: ['test'],
              identifiers: ['test-user'],
              capturedAt: new Date().toISOString()
            }
          }

          // Create audit trail and corrupt it
          const auditTrail = new AuditTrail(workflowId)
          auditTrail.appendEvent(AuditTrail.createEvent(workflowId, 'WORKFLOW_CREATED', {}))
          
          // Corrupt the audit trail by modifying internal state
          const state = auditTrail.getState()
          const corruptedState = {
            ...state,
            entries: state.entries.map(entry => ({
              ...entry,
              hash: 'corrupted-hash'
            }))
          }
          const corruptedTrail = AuditTrail.fromState(corruptedState)

          // Should throw error when trying to generate certificate
          expect(() => {
            CertificateGenerator.generateCertificate({
              workflowState,
              auditTrail: corruptedTrail
            })
          }).toThrow('Cannot generate certificate: audit trail integrity check failed')
        }
      ),
      { numRuns: 20 }
    )
  })

  it('should properly redact user identifiers while preserving verification information', () => {
    const workflowId = 'test-workflow'
    const userIdentifiers = {
      userId: 'user12345',
      emails: ['john.doe@example.com', 'jane@test.org'],
      phones: ['+1234567890', '555-123-4567'],
      aliases: ['johndoe', 'jdoe']
    }

    const workflowState: WorkflowState = {
      workflowId,
      userIdentifiers,
      status: 'COMPLETED',
      policyVersion: 'v1.0',
      legalHolds: [],
      steps: {
        'test-step': {
          status: 'DELETED',
          attempts: 1,
          evidence: {
            timestamp: new Date().toISOString()
          }
        }
      },
      backgroundJobs: {},
      auditHashes: [],
      dataLineageSnapshot: {
        systems: ['test'],
        identifiers: ['test'],
        capturedAt: new Date().toISOString()
      }
    }

    const auditTrail = new AuditTrail(workflowId)
    auditTrail.appendEvent(AuditTrail.createEvent(workflowId, 'WORKFLOW_CREATED', {}))

    const certificate = CertificateGenerator.generateCertificate({
      workflowState,
      auditTrail,
      redactUserIdentifiers: true
    })

    // Verify user ID is redacted but preserves first/last character
    expect(certificate.userIdentifiers.userId).not.toBe(userIdentifiers.userId)
    expect(certificate.userIdentifiers.userId).toContain('***')
    expect(certificate.userIdentifiers.userId.startsWith('u')).toBe(true)
    expect(certificate.userIdentifiers.userId.endsWith('5')).toBe(true)

    // Verify emails are redacted but preserve domains
    expect(certificate.userIdentifiers.emails[0]).toContain('@example.com')
    expect(certificate.userIdentifiers.emails[0]).toContain('***')
    expect(certificate.userIdentifiers.emails[1]).toContain('@test.org')
    expect(certificate.userIdentifiers.emails[1]).toContain('***')

    // Verify phones are redacted
    certificate.userIdentifiers.phones.forEach(phone => {
      expect(phone).toContain('***')
    })

    // Verify aliases are redacted
    expect(certificate.userIdentifiers.aliases[0].startsWith('j')).toBe(true)
    expect(certificate.userIdentifiers.aliases[0].endsWith('e')).toBe(true)
    expect(certificate.userIdentifiers.aliases[0]).toContain('***')
  })
})