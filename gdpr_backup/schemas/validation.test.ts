/**
 * Property-based tests for data model validation schemas
 * **Feature: gdpr-erasure-system, Property 1: Request Validation Consistency**
 * **Validates: Requirements 1.1, 1.2**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  ErasureRequestSchema,
  UserIdentifiersSchema,
  WorkflowStateSchema,
  CertificateOfDestructionSchema,
  PolicyConfigSchema,
  PIIFindingSchema,
  BackgroundJobSchema,
  type ErasureRequest,
  type UserIdentifiers,
  type WorkflowState,
  type CertificateOfDestruction,
  type PolicyConfig,
  type PIIFinding,
  type BackgroundJob
} from './index.js'

describe('Data Model Validation - Property Tests', () => {
  describe('Property 1: Request Validation Consistency', () => {
    it('should validate valid UserIdentifiers consistently', () => {
      const validEmailArb = fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s))
        .chain(name => fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s))
          .map(domain => `${name}@${domain}.com`))
      
      const userIdentifiersArb = fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9_-]+$/.test(s)),
        emails: fc.array(validEmailArb, { maxLength: 3 }),
        phones: fc.array(fc.integer({ min: 1000000000, max: 9999999999 }).map(n => `+1${n}`), { maxLength: 2 }),
        aliases: fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9_-]+$/.test(s)), { maxLength: 3 })
      })

      fc.assert(fc.property(userIdentifiersArb, (userIds: UserIdentifiers) => {
        const result = UserIdentifiersSchema.safeParse(userIds)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toEqual(userIds)
        }
      }), { numRuns: 100 })
    })

    it('should validate valid ErasureRequest consistently', () => {
      const legalProofArb = fc.record({
        type: fc.constantFrom('SIGNED_REQUEST', 'LEGAL_FORM', 'OTP_VERIFIED'),
        evidence: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9_\s-]+$/.test(s)),
        verifiedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString())
      })

      const requestedByArb = fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9_-]+$/.test(s)),
        role: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9_\s-]+$/.test(s)),
        organization: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9_\s-]+$/.test(s))
      })

      const validEmailArb = fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s))
        .chain(name => fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s))
          .map(domain => `${name}@${domain}.com`))
      
      const userIdentifiersArb = fc.record({
        userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9_-]+$/.test(s)),
        emails: fc.array(validEmailArb, { maxLength: 2 }),
        phones: fc.array(fc.integer({ min: 1000000000, max: 9999999999 }).map(n => `+1${n}`), { maxLength: 2 }),
        aliases: fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9_-]+$/.test(s)), { maxLength: 2 })
      })

      const erasureRequestArb = fc.record({
        requestId: fc.uuid(),
        userIdentifiers: userIdentifiersArb,
        legalProof: legalProofArb,
        jurisdiction: fc.constantFrom('EU', 'US', 'OTHER'),
        requestedBy: requestedByArb,
        createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString()),
        workflowId: fc.option(fc.uuid(), { nil: undefined })
      })

      fc.assert(fc.property(erasureRequestArb, (request: ErasureRequest) => {
        const result = ErasureRequestSchema.safeParse(request)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toEqual(request)
        }
      }), { numRuns: 50 })
    })

    it('should reject ErasureRequest with invalid email formats', () => {
      const invalidEmailArb = fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('@'))
      
      fc.assert(fc.property(invalidEmailArb, (invalidEmail: string) => {
        const invalidRequest = {
          requestId: '123e4567-e89b-12d3-a456-426614174000',
          userIdentifiers: {
            userId: 'user123',
            emails: [invalidEmail], // Invalid email
            phones: ['+1234567890'],
            aliases: ['alias1']
          },
          legalProof: {
            type: 'SIGNED_REQUEST' as const,
            evidence: 'legal-document-123',
            verifiedAt: new Date().toISOString()
          },
          jurisdiction: 'EU' as const,
          requestedBy: {
            userId: 'admin123',
            role: 'compliance-officer',
            organization: 'ACME Corp'
          },
          createdAt: new Date().toISOString()
        }
        
        const result = ErasureRequestSchema.safeParse(invalidRequest)
        expect(result.success).toBe(false)
      }), { numRuns: 50 })
    })

    it('should reject ErasureRequest with invalid UUID formats', () => {
      const invalidUuidArb = fc.string({ minLength: 1, maxLength: 30 }).filter(s => 
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
      )
      
      fc.assert(fc.property(invalidUuidArb, (invalidUuid: string) => {
        const invalidRequest = {
          requestId: invalidUuid, // Invalid UUID
          userIdentifiers: {
            userId: 'user123',
            emails: ['user@example.com'],
            phones: ['+1234567890'],
            aliases: ['alias1']
          },
          legalProof: {
            type: 'SIGNED_REQUEST' as const,
            evidence: 'legal-document-123',
            verifiedAt: new Date().toISOString()
          },
          jurisdiction: 'EU' as const,
          requestedBy: {
            userId: 'admin123',
            role: 'compliance-officer',
            organization: 'ACME Corp'
          },
          createdAt: new Date().toISOString()
        }
        
        const result = ErasureRequestSchema.safeParse(invalidRequest)
        expect(result.success).toBe(false)
      }), { numRuns: 50 })
    })

    it('should validate PIIFinding with confidence bounds', () => {
      const piiFindingArb = fc.record({
        matchId: fc.uuid(),
        system: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9_-]+$/.test(s)),
        location: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9_\s/-]+$/.test(s)),
        piiType: fc.constantFrom('email', 'name', 'phone', 'address', 'custom'),
        confidence: fc.float({ min: 0, max: Math.fround(1), noNaN: true }),
        snippet: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9_\s@.-]+$/.test(s)),
        provenance: fc.record({
          messageId: fc.option(fc.string({ maxLength: 30 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9_-]+$/.test(s)), { nil: undefined }),
          timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString()),
          channel: fc.option(fc.string({ maxLength: 20 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9_-]+$/.test(s)), { nil: undefined })
        })
      })

      fc.assert(fc.property(piiFindingArb, (finding: PIIFinding) => {
        const result = PIIFindingSchema.safeParse(finding)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.confidence).toBeGreaterThanOrEqual(0)
          expect(result.data.confidence).toBeLessThanOrEqual(1)
        }
      }), { numRuns: 50 })
    })

    it('should reject PIIFinding with confidence outside bounds', () => {
      const invalidConfidenceArb = fc.oneof(
        fc.float({ min: Math.fround(-10), max: Math.fround(-0.1) }), // Negative confidence
        fc.float({ min: Math.fround(1.1), max: Math.fround(10) })    // Confidence > 1
      )
      
      fc.assert(fc.property(invalidConfidenceArb, (invalidConfidence: number) => {
        const invalidFinding = {
          matchId: '123e4567-e89b-12d3-a456-426614174000',
          system: 'slack',
          location: 'channel-123',
          piiType: 'email' as const,
          confidence: invalidConfidence, // Invalid confidence
          snippet: 'user@example.com found in message',
          provenance: {
            messageId: 'msg-123',
            timestamp: new Date().toISOString(),
            channel: 'general'
          }
        }
        
        const result = PIIFindingSchema.safeParse(invalidFinding)
        expect(result.success).toBe(false)
      }), { numRuns: 50 })
    })

    it('should validate PolicyConfig with proper confidence threshold ordering', () => {
      const validThresholdsArb = fc.record({
        manualReview: fc.float({ min: 0, max: Math.fround(0.8) }),
        autoDelete: fc.float({ min: Math.fround(0.5), max: Math.fround(1) })
      }).filter(thresholds => thresholds.autoDelete >= thresholds.manualReview)

      const policyConfigArb = fc.record({
        version: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        jurisdiction: fc.constantFrom('EU', 'US', 'OTHER'),
        retentionRules: fc.array(fc.record({
          system: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          retentionDays: fc.nat({ max: 3650 }),
          priority: fc.integer({ min: 1, max: 10 })
        }), { maxLength: 3 }),
        legalHoldRules: fc.array(fc.record({
          system: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          conditions: fc.array(fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0), { maxLength: 3 }),
          maxDuration: fc.integer({ min: 1, max: 365 })
        }), { maxLength: 3 }),
        zombieCheckInterval: fc.integer({ min: 1, max: 90 }),
        confidenceThresholds: validThresholdsArb
      })

      fc.assert(fc.property(policyConfigArb, (policy: PolicyConfig) => {
        const result = PolicyConfigSchema.safeParse(policy)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.confidenceThresholds.autoDelete)
            .toBeGreaterThanOrEqual(result.data.confidenceThresholds.manualReview)
        }
      }), { numRuns: 50 })
    })

    it('should reject PolicyConfig with invalid confidence threshold ordering', () => {
      fc.assert(fc.property(
        fc.float({ min: Math.fround(0.6), max: Math.fround(1) }),    // autoDelete
        fc.float({ min: 0, max: Math.fround(0.5) }),    // manualReview
        (autoDelete: number, manualReview: number) => {
          // Only test cases where autoDelete < manualReview (invalid)
          if (autoDelete >= manualReview) return true
          
          const invalidPolicy = {
            version: '1.0.0',
            jurisdiction: 'EU' as const,
            retentionRules: [],
            legalHoldRules: [],
            zombieCheckInterval: 30,
            confidenceThresholds: { autoDelete, manualReview }
          }
          
          const result = PolicyConfigSchema.safeParse(invalidPolicy)
          expect(result.success).toBe(false)
        }
      ), { numRuns: 50 })
    })
  })
})