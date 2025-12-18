/**
 * Property-based tests for immutable audit logging
 * **Feature: gdpr-erasure-system, Property 17: Immutable Audit Logging**
 * **Validates: Requirements 6.1, 6.2, 6.5**
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { AuditTrail, AuditEvent } from '../../../src/gdpr/services/audit-trail.js'
import { CryptoUtils } from '../../../src/gdpr/utils/crypto.js'

describe('Immutable Audit Logging Properties', () => {
  
  /**
   * Property 17: Immutable Audit Logging
   * For any deletion operation or workflow state change, the system should create 
   * timestamped, hash-chained audit entries that detect tampering
   */
  it('should create tamper-evident audit entries with hash chains for all operations', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // workflowId
        fc.array(
          fc.record({
            eventType: fc.constantFrom(
              'WORKFLOW_CREATED', 'STEP_STARTED', 'STEP_COMPLETED', 
              'STEP_FAILED', 'STATE_UPDATED', 'CERTIFICATE_GENERATED'
            ),
            data: fc.record({
              stepName: fc.string({ minLength: 1, maxLength: 15 }),
              system: fc.string({ minLength: 1, maxLength: 10 }),
              evidence: fc.string({ minLength: 0, maxLength: 50 })
            }),
            metadata: fc.record({
              stepName: fc.string({ minLength: 1, maxLength: 15 }),
              system: fc.string({ minLength: 1, maxLength: 10 }),
              userId: fc.string({ minLength: 1, maxLength: 10 })
            })
          }),
          { minLength: 1, maxLength: 10 }
        ), // events
        (workflowId, eventConfigs) => {
          const auditTrail = new AuditTrail(workflowId)
          const initialHashChainLength = auditTrail.getHashChain().length
          
          // Add events to audit trail
          const addedEntries = eventConfigs.map(config => {
            const event = AuditTrail.createEvent(
              workflowId,
              config.eventType,
              config.data,
              config.metadata
            )
            return auditTrail.appendEvent(event)
          })

          // Verify hash chain properties
          const hashChain = auditTrail.getHashChain()
          const entries = auditTrail.getEntries()

          // Hash chain should grow by number of events
          expect(hashChain.length).toBe(initialHashChainLength + eventConfigs.length)
          
          // Each entry should have correct hash chain linkage
          for (let i = 0; i < addedEntries.length; i++) {
            const entry = addedEntries[i]
            const expectedPreviousHash = hashChain[i]
            const expectedCurrentHash = hashChain[i + 1]

            expect(entry.previousHash).toBe(expectedPreviousHash)
            expect(entry.hash).toBe(expectedCurrentHash)

            // Verify hash is correctly computed
            const computedHash = CryptoUtils.createHashChain(entry.previousHash, entry.event)
            expect(entry.hash).toBe(computedHash)
          }

          // Verify integrity check passes
          expect(auditTrail.verifyIntegrity()).toBe(true)

          // Verify tampering detection works
          const tamperingResult = auditTrail.detectTampering()
          expect(tamperingResult.tampered).toBe(false)
          expect(tamperingResult.corruptedIndex).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should detect tampering when audit entries are modified', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // workflowId
        fc.array(
          fc.record({
            eventType: fc.constantFrom('STEP_COMPLETED', 'STATE_UPDATED'),
            data: fc.record({
              stepName: fc.string({ minLength: 1, maxLength: 15 }),
              evidence: fc.string({ minLength: 1, maxLength: 50 })
            })
          }),
          { minLength: 2, maxLength: 5 }
        ), // events
        fc.integer({ min: 0, max: 4 }), // corruptionIndex
        (workflowId, eventConfigs, corruptionIndex) => {
          fc.pre(corruptionIndex < eventConfigs.length)

          const auditTrail = new AuditTrail(workflowId)
          
          // Add events
          eventConfigs.forEach(config => {
            const event = AuditTrail.createEvent(workflowId, config.eventType, config.data)
            auditTrail.appendEvent(event)
          })

          // Verify initial integrity
          expect(auditTrail.verifyIntegrity()).toBe(true)

          // Corrupt an entry by modifying its data
          const state = auditTrail.getState()
          const corruptedState = {
            ...state,
            entries: state.entries.map((entry, index) => {
              if (index === corruptionIndex) {
                return {
                  ...entry,
                  event: {
                    ...entry.event,
                    data: { ...entry.event.data, corrupted: true }
                  }
                }
              }
              return entry
            })
          }

          const corruptedTrail = AuditTrail.fromState(corruptedState)

          // Should detect tampering
          expect(corruptedTrail.verifyIntegrity()).toBe(false)
          
          const tamperingResult = corruptedTrail.detectTampering()
          expect(tamperingResult.tampered).toBe(true)
          expect(tamperingResult.corruptedIndex).toBe(corruptionIndex)
          expect(tamperingResult.details).toContain('Hash mismatch')
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should maintain immutable audit entries that cannot be modified after creation', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // workflowId
        fc.record({
          eventType: fc.constantFrom('WORKFLOW_CREATED', 'STEP_STARTED'),
          data: fc.record({
            stepName: fc.string({ minLength: 1, maxLength: 15 }),
            system: fc.string({ minLength: 1, maxLength: 10 })
          })
        }),
        (workflowId, eventConfig) => {
          const auditTrail = new AuditTrail(workflowId)
          const event = AuditTrail.createEvent(workflowId, eventConfig.eventType, eventConfig.data)
          
          const entry = auditTrail.appendEvent(event)
          const originalHash = entry.hash
          const originalData = JSON.stringify(entry.event.data)

          // Get entries and try to modify them
          const entries = auditTrail.getEntries()
          const retrievedEntry = entries[0]

          // Modify the retrieved entry (should not affect internal state)
          retrievedEntry.event.data.modified = true
          retrievedEntry.hash = 'tampered-hash'

          // Verify internal state is unchanged
          const entriesAfterModification = auditTrail.getEntries()
          const internalEntry = entriesAfterModification[0]

          expect(internalEntry.hash).toBe(originalHash)
          expect(JSON.stringify(internalEntry.event.data)).toBe(originalData)
          expect(internalEntry.event.data).not.toHaveProperty('modified')

          // Verify integrity is still intact
          expect(auditTrail.verifyIntegrity()).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should create unique timestamps and event IDs for concurrent operations', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // workflowId
        fc.integer({ min: 2, max: 10 }), // numberOfEvents
        (workflowId, numberOfEvents) => {
          const auditTrail = new AuditTrail(workflowId)
          const events: AuditEvent[] = []

          // Create multiple events rapidly
          for (let i = 0; i < numberOfEvents; i++) {
            const event = AuditTrail.createEvent(
              workflowId,
              'STATE_UPDATED',
              { step: `step-${i}`, data: `data-${i}` }
            )
            events.push(event)
            auditTrail.appendEvent(event)
          }

          // Verify all event IDs are unique
          const eventIds = events.map(e => e.eventId)
          const uniqueEventIds = new Set(eventIds)
          expect(uniqueEventIds.size).toBe(eventIds.length)

          // Verify all timestamps are valid ISO strings
          events.forEach(event => {
            expect(() => new Date(event.timestamp)).not.toThrow()
            expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp)
          })

          // Verify hash chain integrity with all events
          expect(auditTrail.verifyIntegrity()).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should support querying audit events by type and step name', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // workflowId
        fc.array(
          fc.record({
            eventType: fc.constantFrom('STEP_STARTED', 'STEP_COMPLETED', 'STEP_FAILED'),
            stepName: fc.string({ minLength: 1, maxLength: 10 }),
            data: fc.record({
              evidence: fc.string({ minLength: 0, maxLength: 20 })
            })
          }),
          { minLength: 1, maxLength: 8 }
        ),
        (workflowId, eventConfigs) => {
          const auditTrail = new AuditTrail(workflowId)

          // Add events
          eventConfigs.forEach(config => {
            const event = AuditTrail.createEvent(
              workflowId,
              config.eventType,
              config.data,
              { stepName: config.stepName }
            )
            auditTrail.appendEvent(event)
          })

          // Test querying by event type
          const uniqueEventTypes = [...new Set(eventConfigs.map(c => c.eventType))]
          uniqueEventTypes.forEach(eventType => {
            const eventsByType = auditTrail.getEventsByType(eventType)
            const expectedCount = eventConfigs.filter(c => c.eventType === eventType).length
            
            expect(eventsByType.length).toBe(expectedCount)
            eventsByType.forEach(entry => {
              expect(entry.event.eventType).toBe(eventType)
            })
          })

          // Test querying by step name
          const uniqueStepNames = [...new Set(eventConfigs.map(c => c.stepName))]
          uniqueStepNames.forEach(stepName => {
            const stepEvents = auditTrail.getStepEvents(stepName)
            const expectedCount = eventConfigs.filter(c => c.stepName === stepName).length
            
            expect(stepEvents.length).toBe(expectedCount)
            stepEvents.forEach(entry => {
              expect(entry.event.metadata?.stepName).toBe(stepName)
            })
          })
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should maintain hash chain integrity across audit trail restoration from state', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // workflowId
        fc.array(
          fc.record({
            eventType: fc.constantFrom('WORKFLOW_CREATED', 'STATE_UPDATED', 'CERTIFICATE_GENERATED'),
            data: fc.anything()
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (workflowId, eventConfigs) => {
          const originalTrail = new AuditTrail(workflowId)

          // Add events to original trail
          eventConfigs.forEach(config => {
            const event = AuditTrail.createEvent(workflowId, config.eventType, config.data)
            originalTrail.appendEvent(event)
          })

          // Get state and restore from it
          const state = originalTrail.getState()
          const restoredTrail = AuditTrail.fromState(state)

          // Verify both trails have identical state
          expect(restoredTrail.getHashChain()).toEqual(originalTrail.getHashChain())
          expect(restoredTrail.getEntries()).toEqual(originalTrail.getEntries())
          expect(restoredTrail.getHashRoot()).toBe(originalTrail.getHashRoot())

          // Verify both trails pass integrity checks
          expect(originalTrail.verifyIntegrity()).toBe(true)
          expect(restoredTrail.verifyIntegrity()).toBe(true)

          // Verify both trails detect no tampering
          expect(originalTrail.detectTampering().tampered).toBe(false)
          expect(restoredTrail.detectTampering().tampered).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})