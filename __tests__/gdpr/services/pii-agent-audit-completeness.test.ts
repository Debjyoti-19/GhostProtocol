/**
 * Property-based tests for PII Agent audit completeness
 * **Feature: gdpr-erasure-system, Property 12: Agent Audit Completeness**
 * **Validates: Requirements 4.5, 4.6, 4.7**
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { PIIAgent } from '../../../src/gdpr/services/pii-agent.js'

describe('PII Agent Audit Completeness Properties', () => {
  let agent: PIIAgent

  beforeEach(() => {
    agent = new PIIAgent()
    agent.clearAuditLog()
  })

  /**
   * Property 12: Agent Audit Completeness
   * For any PII agent operation, all inputs and outputs should be recorded in the audit trail 
   * with proper data minimization (references instead of raw content)
   */
  it('should record complete audit entries for all PII detection operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          content: fc.string({ minLength: 0, maxLength: 100 }),
          system: fc.string({ minLength: 1, maxLength: 20 }),
          location: fc.string({ minLength: 1, maxLength: 30 })
        }),
        async ({ content, system, location }) => {
          const initialAuditCount = agent.getAuditLog().length

          await agent.detectPII({
            content,
            system,
            location
          })

          const auditLog = agent.getAuditLog()
          
          // Should have exactly one new audit entry
          expect(auditLog.length).toBe(initialAuditCount + 1)
          
          const auditEntry = auditLog[auditLog.length - 1]

          // Verify audit entry structure
          expect(auditEntry).toHaveProperty('agentId')
          expect(auditEntry).toHaveProperty('inputHash')
          expect(auditEntry).toHaveProperty('inputMetadata')
          expect(auditEntry).toHaveProperty('outputSummary')
          expect(auditEntry).toHaveProperty('processedAt')
          expect(auditEntry).toHaveProperty('processingTimeMs')

          // Verify basic field types
          expect(typeof auditEntry.agentId).toBe('string')
          expect(typeof auditEntry.inputHash).toBe('string')
          expect(typeof auditEntry.processedAt).toBe('string')
          expect(typeof auditEntry.processingTimeMs).toBe('number')

          // Verify inputMetadata contains required fields
          expect(auditEntry.inputMetadata.system).toBe(system)
          expect(auditEntry.inputMetadata.location).toBe(location)
          expect(auditEntry.inputMetadata.contentLength).toBe(content.length)

          // Verify outputSummary contains required fields
          expect(typeof auditEntry.outputSummary.findingsCount).toBe('number')
          expect(typeof auditEntry.outputSummary.highConfidenceCount).toBe('number')
          expect(typeof auditEntry.outputSummary.mediumConfidenceCount).toBe('number')
          expect(typeof auditEntry.outputSummary.lowConfidenceCount).toBe('number')
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should maintain data minimization by not storing raw content in audit logs', async () => {
    const content = 'This contains secret information'
    
    await agent.detectPII({
      content,
      system: 'test-system',
      location: 'test-location'
    })

    const auditLog = agent.getAuditLog()
    const auditEntry = auditLog[auditLog.length - 1]

    // Verify raw content is not stored in the audit entry
    const auditEntryString = JSON.stringify(auditEntry)
    expect(auditEntryString).not.toContain(content)
    expect(auditEntryString).not.toContain('secret')

    // But metadata should still be present
    expect(auditEntry.inputMetadata.contentLength).toBe(content.length)
    expect(auditEntry.inputHash).toBeDefined()
    expect(auditEntry.inputHash.length).toBeGreaterThan(0)
  })

  it('should create unique audit entries for multiple operations', async () => {
    const operations = [
      { content: 'test1', system: 'sys1', location: 'loc1' },
      { content: 'test2', system: 'sys2', location: 'loc2' },
      { content: 'test3', system: 'sys3', location: 'loc3' }
    ]

    const initialAuditCount = agent.getAuditLog().length

    // Perform multiple operations
    for (const op of operations) {
      await agent.detectPII(op)
    }

    const auditLog = agent.getAuditLog()
    
    // Should have one audit entry per operation
    expect(auditLog.length).toBe(initialAuditCount + operations.length)

    // Each audit entry should have unique agentId
    const agentIds = auditLog.slice(initialAuditCount).map(entry => entry.agentId)
    const uniqueAgentIds = new Set(agentIds)
    expect(uniqueAgentIds.size).toBe(agentIds.length)
  })

  it('should record accurate output summaries that match actual findings', async () => {
    const content = 'Contact: test@example.com and john@doe.org'
    
    const result = await agent.detectPII({
      content,
      system: 'test-system',
      location: 'test-location'
    })

    const auditLog = agent.getAuditLog()
    const auditEntry = auditLog[auditLog.length - 1]

    // Verify output summary matches actual findings
    expect(auditEntry.outputSummary.findingsCount).toBe(result.findings.length)

    // Count findings by confidence category
    const actualHighConfidence = result.findings.filter(f => f.confidence >= 0.8).length
    const actualMediumConfidence = result.findings.filter(f => f.confidence >= 0.5 && f.confidence < 0.8).length
    const actualLowConfidence = result.findings.filter(f => f.confidence < 0.5).length

    expect(auditEntry.outputSummary.highConfidenceCount).toBe(actualHighConfidence)
    expect(auditEntry.outputSummary.mediumConfidenceCount).toBe(actualMediumConfidence)
    expect(auditEntry.outputSummary.lowConfidenceCount).toBe(actualLowConfidence)
  })

  it('should handle audit log retrieval without exposing sensitive data', async () => {
    await agent.detectPII({
      content: 'sensitive data',
      system: 'test-system',
      location: 'test-location'
    })

    const auditLog = agent.getAuditLog()
    
    // Verify audit log is a copy (not reference to internal state)
    const auditLog2 = agent.getAuditLog()
    expect(auditLog).not.toBe(auditLog2) // Different object references
    expect(auditLog).toEqual(auditLog2) // But same content

    // Verify modifying returned audit log doesn't affect internal state
    auditLog.push({
      agentId: 'fake-id',
      inputHash: 'fake-hash',
      inputMetadata: {
        system: 'fake',
        location: 'fake',
        contentLength: 0
      },
      outputSummary: {
        findingsCount: 0,
        highConfidenceCount: 0,
        mediumConfidenceCount: 0,
        lowConfidenceCount: 0
      },
      processedAt: new Date().toISOString(),
      processingTimeMs: 0
    })

    const auditLog3 = agent.getAuditLog()
    expect(auditLog3.length).toBe(1) // Should not include fake entry
  })
})