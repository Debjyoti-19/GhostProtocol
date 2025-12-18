/**
 * Property-based tests for PII Agent structured output format
 * **Feature: gdpr-erasure-system, Property 10: Structured Output Format**
 * **Validates: Requirements 4.2**
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { PIIAgent } from '../../../src/gdpr/services/pii-agent.js'
import { PIIType } from '../../../src/gdpr/types/index.js'

describe('PII Agent Structured Output Format Properties', () => {
  let agent: PIIAgent

  beforeEach(() => {
    agent = new PIIAgent()
    agent.clearAuditLog()
  })

  /**
   * Property 10: Structured Output Format
   * For any text content processed by the PII agent, the output should contain 
   * structured findings with match location, PII type, and confidence scores
   */
  it('should return structured findings with all required fields for any content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          content: fc.string({ minLength: 0, maxLength: 1000 }),
          system: fc.string({ minLength: 1, maxLength: 50 }),
          location: fc.string({ minLength: 1, maxLength: 100 }),
          provenance: fc.record({
            messageId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            timestamp: fc.date().map(d => d.toISOString()),
            channel: fc.option(fc.string({ minLength: 1, maxLength: 30 }))
          }).map(p => ({
            ...p,
            messageId: p.messageId || undefined,
            channel: p.channel || undefined
          }))
        }),
        async ({ content, system, location, provenance }) => {
          const result = await agent.detectPII({
            content,
            system,
            location,
            provenance
          })

          // Verify top-level output structure
          expect(result).toHaveProperty('findings')
          expect(result).toHaveProperty('processedAt')
          expect(result).toHaveProperty('contentHash')
          expect(result).toHaveProperty('metadata')

          // Verify processedAt is a valid ISO string
          expect(() => new Date(result.processedAt)).not.toThrow()
          expect(new Date(result.processedAt).toISOString()).toBe(result.processedAt)

          // Verify contentHash is present
          expect(result.contentHash).toBeDefined()
          expect(typeof result.contentHash).toBe('string')
          expect(result.contentHash.length).toBeGreaterThan(0)

          // Verify metadata structure
          expect(result.metadata).toHaveProperty('preFilterMatches')
          expect(result.metadata).toHaveProperty('chunkCount')
          expect(result.metadata).toHaveProperty('totalConfidenceScore')
          expect(typeof result.metadata.preFilterMatches).toBe('number')
          expect(typeof result.metadata.chunkCount).toBe('number')
          expect(typeof result.metadata.totalConfidenceScore).toBe('number')
          expect(result.metadata.preFilterMatches).toBeGreaterThanOrEqual(0)
          expect(result.metadata.chunkCount).toBeGreaterThanOrEqual(1)
          expect(result.metadata.totalConfidenceScore).toBeGreaterThanOrEqual(0)

          // Verify findings array structure
          expect(Array.isArray(result.findings)).toBe(true)

          // For each finding, verify complete structure
          result.findings.forEach(finding => {
            // Required fields
            expect(finding).toHaveProperty('matchId')
            expect(finding).toHaveProperty('system')
            expect(finding).toHaveProperty('location')
            expect(finding).toHaveProperty('piiType')
            expect(finding).toHaveProperty('confidence')
            expect(finding).toHaveProperty('snippet')
            expect(finding).toHaveProperty('provenance')

            // Field types and constraints
            expect(typeof finding.matchId).toBe('string')
            expect(finding.matchId.length).toBeGreaterThan(0)
            
            expect(finding.system).toBe(system)
            expect(finding.location).toBe(location)
            
            expect(['email', 'name', 'phone', 'address', 'custom']).toContain(finding.piiType)
            
            expect(typeof finding.confidence).toBe('number')
            expect(finding.confidence).toBeGreaterThan(0)
            expect(finding.confidence).toBeLessThanOrEqual(1)
            
            expect(typeof finding.snippet).toBe('string')
            expect(finding.snippet.length).toBeGreaterThan(0)

            // Provenance structure
            expect(finding.provenance).toHaveProperty('timestamp')
            expect(() => new Date(finding.provenance.timestamp)).not.toThrow()
            
            // Optional provenance fields should match input if provided
            if (provenance.messageId) {
              expect(finding.provenance.messageId).toBe(provenance.messageId)
            }
            if (provenance.channel) {
              expect(finding.provenance.channel).toBe(provenance.channel)
            }
          })

          // Verify metadata consistency with findings
          const actualTotalConfidence = result.findings.reduce((sum, f) => sum + f.confidence, 0)
          expect(Math.abs(result.metadata.totalConfidenceScore - actualTotalConfidence)).toBeLessThan(0.01)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should maintain consistent output structure for content with known PII patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          emails: fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s)),
              fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(s)),
              fc.string({ minLength: 2, maxLength: 4 }).filter(s => /^[A-Za-z]+$/.test(s))
            ).map(([user, domain, tld]) => `${user}@${domain}.${tld}`),
            { minLength: 1, maxLength: 3 }
          ),
          phones: fc.array(
            fc.oneof(
              fc.constant('555-123-4567'),
              fc.constant('(555) 123-4567'),
              fc.constant('555.123.4567')
            ),
            { minLength: 1, maxLength: 2 }
          ),
          system: fc.string({ minLength: 1, maxLength: 20 }),
          location: fc.string({ minLength: 1, maxLength: 50 })
        }),
        async ({ emails, phones, system, location }) => {
          const content = `Here are some contacts: ${emails.join(', ')} and ${phones.join(', ')}`
          
          const result = await agent.detectPII({
            content,
            system,
            location
          })

          // Should find findings for the embedded PII
          expect(result.findings.length).toBeGreaterThan(0)

          // Verify each finding has the complete structured format
          result.findings.forEach(finding => {
            // UUID format for matchId
            expect(finding.matchId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
            
            // System and location should match input
            expect(finding.system).toBe(system)
            expect(finding.location).toBe(location)
            
            // PII type should be valid
            expect(['email', 'name', 'phone', 'address', 'custom']).toContain(finding.piiType)
            
            // Confidence should be reasonable for known patterns
            expect(finding.confidence).toBeGreaterThan(0.3) // Should have decent confidence for clear patterns
            
            // Snippet should contain the actual matched text
            expect(finding.snippet.length).toBeGreaterThan(0)
            expect(content).toContain(finding.snippet)
            
            // Provenance should have timestamp
            expect(finding.provenance.timestamp).toBeDefined()
            expect(() => new Date(finding.provenance.timestamp)).not.toThrow()
          })

          // Metadata should reflect the processing
          expect(result.metadata.preFilterMatches).toBeGreaterThanOrEqual(emails.length + phones.length)
          expect(result.metadata.chunkCount).toBeGreaterThanOrEqual(1)
          expect(result.metadata.totalConfidenceScore).toBeGreaterThan(0)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should return consistent empty structure for content without PII', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          content: fc.string({ minLength: 5, maxLength: 200 })
            .filter(s => !/@/.test(s)) // No email patterns
            .filter(s => !/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})/.test(s)) // No phone patterns
            .filter(s => !/\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(s)), // No name patterns
          system: fc.string({ minLength: 1, maxLength: 20 }),
          location: fc.string({ minLength: 1, maxLength: 50 })
        }),
        async ({ content, system, location }) => {
          const result = await agent.detectPII({
            content,
            system,
            location
          })

          // Should have proper structure even with no findings
          expect(result.findings).toEqual([])
          expect(result.processedAt).toBeDefined()
          expect(result.contentHash).toBeDefined()
          expect(result.metadata.preFilterMatches).toBe(0)
          expect(result.metadata.chunkCount).toBeGreaterThanOrEqual(1)
          expect(result.metadata.totalConfidenceScore).toBe(0)
        }
      ),
      { numRuns: 30 }
    )
  })
})