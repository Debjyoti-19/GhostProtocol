/**
 * Property-Based Tests for Zombie Check Audit
 * 
 * **Feature: gdpr-erasure-system, Property 24: Zombie Check Audit**
 * **Validates: Requirements 8.4, 8.5**
 * 
 * Property: For any zombie check result (positive or negative), 
 * the system should record the verification in the audit trail
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'
import { AuditTrail } from '../../../src/gdpr/services/audit-trail.js'

// Mock state manager for testing
class MockStateManager {
  private storage: Map<string, any> = new Map()

  async get(namespace: string, key: string): Promise<any> {
    const fullKey = `${namespace}:${key}`
    return this.storage.get(fullKey) || null
  }

  async set(namespace: string, key: string, value: any): Promise<void> {
    const fullKey = `${namespace}:${key}`
    this.storage.set(fullKey, value)
  }

  async delete(namespace: string, key: string): Promise<void> {
    const fullKey = `${namespace}:${key}`
    this.storage.delete(fullKey)
  }

  clear(): void {
    this.storage.clear()
  }
}

// Zombie check audit service
class ZombieCheckAuditService {
  private state: MockStateManager
  private logger: any

  constructor(state: MockStateManager, logger: any) {
    this.state = state
    this.logger = logger
  }

  /**
   * Records zombie check result in audit trail
   */
  async recordZombieCheckResult(
    originalWorkflowId: string,
    checkResult: {
      zombieDataDetected: boolean
      zombieDataSources: string[]
      systemsChecked: string[]
      newWorkflowId?: string
      checkTimestamp: string
    }
  ): Promise<{
    auditEntryId: string
    workflowId: string
    recorded: boolean
  }> {
    const auditEntryId = uuidv4()

    // Get or create audit trail for the workflow
    let auditTrail = await this.state.get('audit_trails', originalWorkflowId)
    
    if (!auditTrail) {
      const trail = new AuditTrail(originalWorkflowId)
      auditTrail = trail.getState()
    } else {
      auditTrail = AuditTrail.fromState(auditTrail).getState()
    }

    // Create audit event
    const auditEvent = {
      eventId: auditEntryId,
      workflowId: originalWorkflowId,
      eventType: 'ZOMBIE_CHECK_COMPLETED' as const,
      timestamp: checkResult.checkTimestamp,
      data: {
        zombieDataDetected: checkResult.zombieDataDetected,
        zombieDataSources: checkResult.zombieDataSources,
        systemsChecked: checkResult.systemsChecked,
        newWorkflowId: checkResult.newWorkflowId,
        checkTimestamp: checkResult.checkTimestamp
      },
      metadata: {
        zombieCheckResult: checkResult.zombieDataDetected ? 'POSITIVE' : 'NEGATIVE',
        systemsCheckedCount: checkResult.systemsChecked.length,
        zombieSourcesCount: checkResult.zombieDataSources.length
      }
    }

    // Append to audit trail
    const trail = AuditTrail.fromState(auditTrail)
    trail.appendEvent(auditEvent)
    
    // Store updated audit trail
    await this.state.set('audit_trails', originalWorkflowId, trail.getState())

    this.logger.info('Zombie check result recorded in audit trail', {
      auditEntryId,
      originalWorkflowId,
      zombieDataDetected: checkResult.zombieDataDetected
    })

    return {
      auditEntryId,
      workflowId: originalWorkflowId,
      recorded: true
    }
  }

  /**
   * Retrieves zombie check audit entries for a workflow
   */
  async getZombieCheckAuditEntries(workflowId: string): Promise<any[]> {
    const auditTrailState = await this.state.get('audit_trails', workflowId)
    
    if (!auditTrailState) {
      return []
    }

    const trail = AuditTrail.fromState(auditTrailState)
    const entries = trail.getEntries()
    
    // Filter for zombie check events
    return entries.filter(entry => 
      entry.event.eventType === 'ZOMBIE_CHECK_COMPLETED'
    )
  }

  /**
   * Verifies audit trail integrity
   */
  async verifyAuditIntegrity(workflowId: string): Promise<boolean> {
    const auditTrailState = await this.state.get('audit_trails', workflowId)
    
    if (!auditTrailState) {
      return false
    }

    const trail = AuditTrail.fromState(auditTrailState)
    return trail.verifyIntegrity()
  }
}

describe('Property 24: Zombie Check Audit', () => {
  let state: MockStateManager
  let service: ZombieCheckAuditService
  let logger: any

  beforeEach(() => {
    state = new MockStateManager()
    logger = {
      info: () => {},
      warn: () => {},
      error: () => {}
    }
    service = new ZombieCheckAuditService(state, logger)
  })

  it('should record audit entry for any zombie check with positive result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uniqueArray(fc.constantFrom('stripe', 'database', 'intercom', 'sendgrid', 'crm'), { minLength: 1, maxLength: 5 }),
        fc.uniqueArray(fc.constantFrom('stripe', 'database', 'intercom', 'sendgrid', 'crm'), { minLength: 1, maxLength: 3 }),
        fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
        async (workflowId, systemsChecked, zombieSources, checkDate) => {
          // Arrange
          const checkResult = {
            zombieDataDetected: true,
            zombieDataSources: zombieSources,
            systemsChecked,
            newWorkflowId: uuidv4(),
            checkTimestamp: checkDate.toISOString()
          }

          // Act
          const auditRecord = await service.recordZombieCheckResult(workflowId, checkResult)

          // Assert
          expect(auditRecord.recorded).toBe(true)
          expect(auditRecord.workflowId).toBe(workflowId)
          expect(auditRecord.auditEntryId).toBeDefined()

          // Verify audit entry is retrievable
          const entries = await service.getZombieCheckAuditEntries(workflowId)
          expect(entries.length).toBeGreaterThan(0)

          const entry = entries[entries.length - 1]
          expect(entry.event.workflowId).toBe(workflowId)
          expect(entry.event.data.zombieDataDetected).toBe(true)
          expect(entry.event.data.zombieDataSources).toEqual(zombieSources)
          expect(entry.event.data.systemsChecked).toEqual(systemsChecked)
          expect(entry.event.data.newWorkflowId).toBe(checkResult.newWorkflowId)
          expect(entry.event.metadata?.zombieCheckResult).toBe('POSITIVE')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should record audit entry for any zombie check with negative result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uniqueArray(fc.constantFrom('stripe', 'database', 'intercom', 'sendgrid', 'crm'), { minLength: 1, maxLength: 5 }),
        fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
        async (workflowId, systemsChecked, checkDate) => {
          // Arrange
          const checkResult = {
            zombieDataDetected: false,
            zombieDataSources: [],
            systemsChecked,
            checkTimestamp: checkDate.toISOString()
          }

          // Act
          const auditRecord = await service.recordZombieCheckResult(workflowId, checkResult)

          // Assert
          expect(auditRecord.recorded).toBe(true)
          expect(auditRecord.workflowId).toBe(workflowId)

          // Verify audit entry is retrievable
          const entries = await service.getZombieCheckAuditEntries(workflowId)
          expect(entries.length).toBeGreaterThan(0)

          const entry = entries[entries.length - 1]
          expect(entry.event.workflowId).toBe(workflowId)
          expect(entry.event.data.zombieDataDetected).toBe(false)
          expect(entry.event.data.zombieDataSources).toEqual([])
          expect(entry.event.data.systemsChecked).toEqual(systemsChecked)
          expect(entry.event.data.newWorkflowId).toBeUndefined()
          expect(entry.event.metadata?.zombieCheckResult).toBe('NEGATIVE')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should maintain audit trail integrity for any sequence of zombie checks', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(
          fc.record({
            zombieDataDetected: fc.boolean(),
            zombieSources: fc.uniqueArray(fc.constantFrom('stripe', 'database', 'intercom'), { maxLength: 3 }),
            systemsChecked: fc.uniqueArray(fc.constantFrom('stripe', 'database', 'intercom', 'sendgrid', 'crm'), { minLength: 1, maxLength: 5 }),
            checkDate: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (workflowId, checks) => {
          // Act - Record multiple zombie checks
          for (const check of checks) {
            const checkResult = {
              zombieDataDetected: check.zombieDataDetected,
              zombieDataSources: check.zombieDataDetected ? check.zombieSources : [],
              systemsChecked: check.systemsChecked,
              newWorkflowId: check.zombieDataDetected ? uuidv4() : undefined,
              checkTimestamp: check.checkDate.toISOString()
            }

            await service.recordZombieCheckResult(workflowId, checkResult)
          }

          // Assert - Verify all entries are recorded
          const entries = await service.getZombieCheckAuditEntries(workflowId)
          expect(entries.length).toBe(checks.length)

          // Verify audit trail integrity
          const integrityValid = await service.verifyAuditIntegrity(workflowId)
          expect(integrityValid).toBe(true)

          // Verify each entry matches the corresponding check
          for (let i = 0; i < checks.length; i++) {
            const entry = entries[i]
            const check = checks[i]
            
            expect(entry.event.data.zombieDataDetected).toBe(check.zombieDataDetected)
            expect(entry.event.data.systemsChecked).toEqual(check.systemsChecked)
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should include all required metadata in audit entries for any check', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.boolean(),
        fc.uniqueArray(fc.constantFrom('stripe', 'database', 'intercom', 'sendgrid', 'crm'), { minLength: 1, maxLength: 5 }),
        fc.uniqueArray(fc.constantFrom('stripe', 'database', 'intercom'), { maxLength: 3 }),
        fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
        async (workflowId, zombieDetected, systemsChecked, zombieSources, checkDate) => {
          // Arrange
          const checkResult = {
            zombieDataDetected: zombieDetected,
            zombieDataSources: zombieDetected ? zombieSources : [],
            systemsChecked,
            newWorkflowId: zombieDetected ? uuidv4() : undefined,
            checkTimestamp: checkDate.toISOString()
          }

          // Act
          await service.recordZombieCheckResult(workflowId, checkResult)

          // Assert
          const entries = await service.getZombieCheckAuditEntries(workflowId)
          const entry = entries[entries.length - 1]

          // Verify required fields are present
          expect(entry.event.eventId).toBeDefined()
          expect(entry.event.workflowId).toBe(workflowId)
          expect(entry.event.eventType).toBe('ZOMBIE_CHECK_COMPLETED')
          expect(entry.event.timestamp).toBeDefined()
          expect(entry.event.data).toBeDefined()
          expect(entry.event.metadata).toBeDefined()

          // Verify data completeness
          expect(entry.event.data.zombieDataDetected).toBe(zombieDetected)
          expect(entry.event.data.zombieDataSources).toEqual(checkResult.zombieDataSources)
          expect(entry.event.data.systemsChecked).toEqual(systemsChecked)
          expect(entry.event.data.checkTimestamp).toBe(checkDate.toISOString())

          // Verify metadata
          expect(entry.event.metadata.zombieCheckResult).toBe(zombieDetected ? 'POSITIVE' : 'NEGATIVE')
          expect(entry.event.metadata.systemsCheckedCount).toBe(systemsChecked.length)
          expect(entry.event.metadata.zombieSourcesCount).toBe(checkResult.zombieDataSources.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve audit entries across service restarts for any workflow', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.boolean(),
        fc.uniqueArray(fc.constantFrom('stripe', 'database', 'intercom', 'sendgrid', 'crm'), { minLength: 1, maxLength: 5 }),
        fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
        async (workflowId, zombieDetected, systemsChecked, checkDate) => {
          // Arrange
          const checkResult = {
            zombieDataDetected: zombieDetected,
            zombieDataSources: zombieDetected ? ['stripe'] : [],
            systemsChecked,
            newWorkflowId: zombieDetected ? uuidv4() : undefined,
            checkTimestamp: checkDate.toISOString()
          }

          // Act - Record with first service instance
          await service.recordZombieCheckResult(workflowId, checkResult)

          // Create new service instance (simulating restart)
          const newService = new ZombieCheckAuditService(state, logger)
          const entries = await newService.getZombieCheckAuditEntries(workflowId)

          // Assert - Audit entries should persist
          expect(entries.length).toBeGreaterThan(0)
          const entry = entries[entries.length - 1]
          expect(entry.event.workflowId).toBe(workflowId)
          expect(entry.event.data.zombieDataDetected).toBe(zombieDetected)

          // Verify integrity after restart
          const integrityValid = await newService.verifyAuditIntegrity(workflowId)
          expect(integrityValid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})
