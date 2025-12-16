/**
 * Property-based tests for PII Agent pre-filtering functionality
 * **Feature: gdpr-erasure-system, Property 9: Agent Pre-filtering**
 * **Validates: Requirements 4.1**
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { PIIAgent } from './pii-agent.js'

describe('PII Agent Pre-filtering Properties', () => {
  let agent: PIIAgent

  beforeEach(() => {
    agent = new PIIAgent()
    agent.clearAuditLog()
  })

  /**
   * Property 9: Agent Pre-filtering
   * For any unstructured data input, the PII agent should apply regex pre-filtering 
   * for emails, names, and aliases before processing
   */
  it('should apply pre-filtering for emails, names, and phone numbers in any content', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate content with known PII patterns
        fc.record({
          baseContent: fc.string({ minLength: 10, maxLength: 500 }),
          emails: fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s)),
              fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(s)),
              fc.string({ minLength: 2, maxLength: 4 }).filter(s => /^[A-Za-z]+$/.test(s))
            ).map(([user, domain, tld]) => `${user}@${domain}.${tld}`),
            { minLength: 0, maxLength: 3 }
          ),
          phones: fc.array(
            fc.oneof(
              fc.constant('555-123-4567'),
              fc.constant('(555) 123-4567'),
              fc.constant('555.123.4567'),
              fc.constant('5551234567')
            ),
            { minLength: 0, maxLength: 2 }
          ),
          names: fc.array(
            fc.tuple(
              fc.string({ minLength: 2, maxLength: 10 }).filter(s => /^[A-Za-z]+$/.test(s)),
              fc.string({ minLength: 2, maxLength: 10 }).filter(s => /^[A-Za-z]+$/.test(s))
            ).map(([first, last]) => `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()} ${last.charAt(0).toUpperCase()}${last.slice(1).toLowerCase()}`),
            { minLength: 0, maxLength: 2 }
          ),
          system: fc.string({ minLength: 1, maxLength: 20 }),
          location: fc.string({ minLength: 1, maxLength: 50 })
        }),
        async ({ baseContent, emails, phones, names, system, location }) => {
          // Construct content with embedded PII
          const piiElements = [...emails, ...phones, ...names]
          const content = piiElements.length > 0 
            ? `${baseContent} ${piiElements.join(' ')} ${baseContent}`
            : baseContent

          const result = await agent.detectPII({
            content,
            system,
            location
          })

          // Verify that pre-filtering detected the expected patterns
          const emailFindings = result.findings.filter(f => f.piiType === 'email')
          const phoneFindings = result.findings.filter(f => f.piiType === 'phone')
          const nameFindings = result.findings.filter(f => f.piiType === 'name')

          // Should find at least as many emails as we embedded
          expect(emailFindings.length).toBeGreaterThanOrEqual(emails.length)
          
          // Should find at least as many phones as we embedded
          expect(phoneFindings.length).toBeGreaterThanOrEqual(phones.length)
          
          // Should find at least as many names as we embedded
          expect(nameFindings.length).toBeGreaterThanOrEqual(names.length)

          // Verify that pre-filter metadata is recorded
          expect(result.metadata.preFilterMatches).toBeGreaterThanOrEqual(piiElements.length)

          // Verify all findings have required fields from pre-filtering
          result.findings.forEach(finding => {
            expect(finding.matchId).toBeDefined()
            expect(finding.system).toBe(system)
            expect(finding.location).toBe(location)
            expect(finding.piiType).toMatch(/^(email|name|phone|address|custom)$/)
            expect(finding.confidence).toBeGreaterThan(0)
            expect(finding.confidence).toBeLessThanOrEqual(1)
            expect(finding.snippet).toBeDefined()
            expect(finding.snippet.length).toBeGreaterThan(0)
          })
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should not find PII in content without recognizable patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          content: fc.string({ minLength: 10, maxLength: 200 })
            .filter(s => !/@/.test(s)) // No email patterns
            .filter(s => !/\d{3}[-.]?\d{3}[-.]?\d{4}/.test(s)) // No phone patterns
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

          // Should find no PII in content without recognizable patterns
          expect(result.findings.length).toBe(0)
          expect(result.metadata.preFilterMatches).toBe(0)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should handle empty or whitespace-only content gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          content: fc.oneof(
            fc.constant(''),
            fc.string().filter(s => s.trim() === ''), // Whitespace only
            fc.constant('   \n\t  ')
          ),
          system: fc.string({ minLength: 1, maxLength: 20 }),
          location: fc.string({ minLength: 1, maxLength: 50 })
        }),
        async ({ content, system, location }) => {
          const result = await agent.detectPII({
            content,
            system,
            location
          })

          // Should handle empty content without errors
          expect(result.findings.length).toBe(0)
          expect(result.metadata.preFilterMatches).toBe(0)
          expect(result.metadata.chunkCount).toBeGreaterThanOrEqual(1)
          expect(result.processedAt).toBeDefined()
          expect(result.contentHash).toBeDefined()
        }
      ),
      { numRuns: 20 }
    )
  })
})