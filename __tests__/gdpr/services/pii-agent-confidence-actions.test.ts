/**
 * Property-based tests for PII Agent confidence-based actions
 * **Feature: gdpr-erasure-system, Property 11: Confidence-Based Actions**
 * **Validates: Requirements 4.3, 4.4**
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { PIIAgent } from '../../../src/gdpr/services/pii-agent.js'
import { PIIFinding } from '../../../src/gdpr/types/index.js'
import { ghostProtocolConfig } from '../../../src/gdpr/config/index.js'

// Helper to create valid float constraints
const confidenceFloat = () => fc.float({ min: Math.fround(0.01), max: Math.fround(0.99) }).filter(n => !isNaN(n) && isFinite(n))

// Helper to create unique match IDs
let matchIdCounter = 0
const uniqueMatchId = () => `test-${++matchIdCounter}-${Math.random().toString(36).substr(2, 9)}`

describe('PII Agent Confidence-Based Actions Properties', () => {
  let agent: PIIAgent

  beforeEach(() => {
    agent = new PIIAgent()
    agent.clearAuditLog()
    matchIdCounter = 0 // Reset counter for each test
  })

  /**
   * Property 11: Confidence-Based Actions
   * For any PII finding, the system should automatically spawn deletion steps for confidence ≥ 0.8, 
   * flag for manual review for 0.5-0.8, and ignore for < 0.5
   */
  it('should correctly categorize findings based on confidence thresholds', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate findings with various confidence levels
        fc.array(
          fc.record({
            system: fc.string({ minLength: 1, maxLength: 20 }),
            location: fc.string({ minLength: 1, maxLength: 50 }),
            piiType: fc.oneof(
              fc.constant('email' as const),
              fc.constant('name' as const),
              fc.constant('phone' as const),
              fc.constant('address' as const),
              fc.constant('custom' as const)
            ),
            confidence: confidenceFloat(),
            snippet: fc.string({ minLength: 1, maxLength: 50 }),
            provenance: fc.record({
              timestamp: fc.date().map(d => d.toISOString()),
              messageId: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
              channel: fc.option(fc.string({ minLength: 1, maxLength: 15 }))
            }).map(p => ({
              timestamp: p.timestamp,
              messageId: p.messageId || undefined,
              channel: p.channel || undefined
            }))
          }),
          { minLength: 1, maxLength: 20 }
        ),
        async (findingTemplates) => {
          // Create findings with unique IDs
          const findings: PIIFinding[] = findingTemplates.map(template => ({
            ...template,
            matchId: uniqueMatchId()
          }))

          const categorized = agent.categorizeFindings(findings)

          // Verify all findings are categorized
          const totalCategorized = categorized.autoDelete.length + 
                                 categorized.manualReview.length + 
                                 categorized.ignore.length
          expect(totalCategorized).toBe(findings.length)

          // Verify no finding appears in multiple categories
          const allCategorizedIds = [
            ...categorized.autoDelete.map(f => f.matchId),
            ...categorized.manualReview.map(f => f.matchId),
            ...categorized.ignore.map(f => f.matchId)
          ]
          const uniqueIds = new Set(allCategorizedIds)
          expect(uniqueIds.size).toBe(allCategorizedIds.length)

          // Verify confidence thresholds are correctly applied
          const autoDeleteThreshold = ghostProtocolConfig.piiAgent.confidenceThresholds.autoDelete
          const manualReviewThreshold = ghostProtocolConfig.piiAgent.confidenceThresholds.manualReview

          // Auto-delete: confidence >= 0.8
          categorized.autoDelete.forEach(finding => {
            expect(finding.confidence).toBeGreaterThanOrEqual(autoDeleteThreshold)
          })

          // Manual review: 0.5 <= confidence < 0.8
          categorized.manualReview.forEach(finding => {
            expect(finding.confidence).toBeGreaterThanOrEqual(manualReviewThreshold)
            expect(finding.confidence).toBeLessThan(autoDeleteThreshold)
          })

          // Ignore: confidence < 0.5
          categorized.ignore.forEach(finding => {
            expect(finding.confidence).toBeLessThan(manualReviewThreshold)
          })

          // Verify expected counts based on input
          const expectedAutoDelete = findings.filter(f => f.confidence >= autoDeleteThreshold).length
          const expectedManualReview = findings.filter(f => 
            f.confidence >= manualReviewThreshold && f.confidence < autoDeleteThreshold
          ).length
          const expectedIgnore = findings.filter(f => f.confidence < manualReviewThreshold).length

          expect(categorized.autoDelete.length).toBe(expectedAutoDelete)
          expect(categorized.manualReview.length).toBe(expectedManualReview)
          expect(categorized.ignore.length).toBe(expectedIgnore)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle edge cases at confidence threshold boundaries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          baseConfidence: fc.oneof(
            fc.constant(0.5), // Exactly at manual review threshold
            fc.constant(0.8), // Exactly at auto-delete threshold
            fc.constant(0.49999), // Just below manual review
            fc.constant(0.79999), // Just below auto-delete
            fc.constant(0.50001), // Just above manual review
            fc.constant(0.80001)  // Just above auto-delete
          ),
          system: fc.string({ minLength: 1, maxLength: 20 }),
          location: fc.string({ minLength: 1, maxLength: 50 })
        }),
        async ({ baseConfidence, system, location }) => {
          const finding: PIIFinding = {
            matchId: uniqueMatchId(),
            system,
            location,
            piiType: 'email',
            confidence: baseConfidence,
            snippet: 'test@example.com',
            provenance: {
              timestamp: new Date().toISOString()
            }
          }

          const categorized = agent.categorizeFindings([finding])

          // Verify boundary conditions
          if (baseConfidence >= 0.8) {
            expect(categorized.autoDelete.length).toBe(1)
            expect(categorized.manualReview.length).toBe(0)
            expect(categorized.ignore.length).toBe(0)
          } else if (baseConfidence >= 0.5) {
            expect(categorized.autoDelete.length).toBe(0)
            expect(categorized.manualReview.length).toBe(1)
            expect(categorized.ignore.length).toBe(0)
          } else {
            expect(categorized.autoDelete.length).toBe(0)
            expect(categorized.manualReview.length).toBe(0)
            expect(categorized.ignore.length).toBe(1)
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should maintain categorization consistency across multiple calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            system: fc.string({ minLength: 1, maxLength: 20 }),
            location: fc.string({ minLength: 1, maxLength: 50 }),
            piiType: fc.oneof(
              fc.constant('email' as const),
              fc.constant('name' as const),
              fc.constant('phone' as const)
            ),
            confidence: confidenceFloat(),
            snippet: fc.string({ minLength: 1, maxLength: 30 }),
            provenance: fc.record({
              timestamp: fc.date().map(d => d.toISOString())
            })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (findingTemplates) => {
          // Create findings with unique IDs
          const findings: PIIFinding[] = findingTemplates.map(template => ({
            ...template,
            matchId: uniqueMatchId()
          }))

          // Categorize the same findings multiple times
          const result1 = agent.categorizeFindings(findings)
          const result2 = agent.categorizeFindings(findings)
          const result3 = agent.categorizeFindings(findings)

          // Results should be identical across calls
          expect(result1.autoDelete.length).toBe(result2.autoDelete.length)
          expect(result1.manualReview.length).toBe(result2.manualReview.length)
          expect(result1.ignore.length).toBe(result2.ignore.length)

          expect(result2.autoDelete.length).toBe(result3.autoDelete.length)
          expect(result2.manualReview.length).toBe(result3.manualReview.length)
          expect(result2.ignore.length).toBe(result3.ignore.length)

          // Verify the same findings are in the same categories
          const sortById = (a: PIIFinding, b: PIIFinding) => a.matchId.localeCompare(b.matchId)
          
          expect(result1.autoDelete.sort(sortById)).toEqual(result2.autoDelete.sort(sortById))
          expect(result1.manualReview.sort(sortById)).toEqual(result2.manualReview.sort(sortById))
          expect(result1.ignore.sort(sortById)).toEqual(result2.ignore.sort(sortById))
        }
      ),
      { numRuns: 30 }
    )
  })

  it('should handle empty findings array gracefully', async () => {
    const result = agent.categorizeFindings([])
    
    expect(result.autoDelete).toEqual([])
    expect(result.manualReview).toEqual([])
    expect(result.ignore).toEqual([])
  })

  it('should preserve all finding properties during categorization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            system: fc.string({ minLength: 1, maxLength: 20 }),
            location: fc.string({ minLength: 1, maxLength: 50 }),
            piiType: fc.oneof(
              fc.constant('email' as const),
              fc.constant('name' as const),
              fc.constant('phone' as const),
              fc.constant('address' as const),
              fc.constant('custom' as const)
            ),
            confidence: confidenceFloat(),
            snippet: fc.string({ minLength: 1, maxLength: 50 }),
            provenance: fc.record({
              timestamp: fc.date().map(d => d.toISOString()),
              messageId: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
              channel: fc.option(fc.string({ minLength: 1, maxLength: 15 }))
            }).map(p => ({
              timestamp: p.timestamp,
              messageId: p.messageId || undefined,
              channel: p.channel || undefined
            }))
          }),
          { minLength: 1, maxLength: 15 }
        ),
        async (findingTemplates) => {
          // Create findings with unique IDs
          const originalFindings: PIIFinding[] = findingTemplates.map(template => ({
            ...template,
            matchId: uniqueMatchId()
          }))

          const categorized = agent.categorizeFindings(originalFindings)
          const allCategorizedFindings = [
            ...categorized.autoDelete,
            ...categorized.manualReview,
            ...categorized.ignore
          ]

          // Every original finding should be present in categorized results
          expect(allCategorizedFindings.length).toBe(originalFindings.length)

          // Verify each finding maintains all its properties
          originalFindings.forEach(originalFinding => {
            const categorizedFinding = allCategorizedFindings.find(f => f.matchId === originalFinding.matchId)
            expect(categorizedFinding).toBeDefined()
            
            if (categorizedFinding) {
              expect(categorizedFinding).toEqual(originalFinding)
            }
          })
        }
      ),
      { numRuns: 50 }
    )
  })
})