/**
 * Property-Based Tests for Zombie Detection and Response
 * 
 * **Feature: gdpr-erasure-system, Property 23: Zombie Detection and Response**
 * **Validates: Requirements 8.2, 8.3**
 * 
 * Property: For any zombie check that detects previously deleted data, 
 * the system should automatically spawn a new erasure workflow and alert legal teams
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'

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

// Mock system scanner
class MockSystemScanner {
  private mockData: Map<string, any[]> = new Map()

  setMockData(system: string, data: any[]): void {
    this.mockData.set(system, data)
  }

  async scanForUserData(system: string, userIdentifiers: any): Promise<any[]> {
    const systemData = this.mockData.get(system) || []
    
    // Check if any data matches the user identifiers
    return systemData.filter(item => {
      return (
        item.userId === userIdentifiers.userId ||
        userIdentifiers.emails.includes(item.email) ||
        userIdentifiers.phones.includes(item.phone)
      )
    })
  }
}

// Zombie detection service
class ZombieDetectionService {
  private state: MockStateManager
  private scanner: MockSystemScanner
  private logger: any
  private alertsSent: any[] = []
  private workflowsSpawned: any[] = []

  constructor(state: MockStateManager, scanner: MockSystemScanner, logger: any) {
    this.state = state
    this.scanner = scanner
    this.logger = logger
  }

  /**
   * Performs zombie data check for a completed workflow
   */
  async performZombieCheck(
    originalWorkflowId: string,
    userIdentifiers: any,
    systemsToCheck: string[]
  ): Promise<{
    zombieDataDetected: boolean
    zombieDataSources: string[]
    newWorkflowId?: string
    alertSent: boolean
    checkTimestamp: string
  }> {
    const checkTimestamp = new Date().toISOString()
    const zombieDataSources: string[] = []

    this.logger.info('Starting zombie data check', {
      originalWorkflowId,
      systemsToCheck
    })

    // Scan each system for zombie data
    for (const system of systemsToCheck) {
      const foundData = await this.scanner.scanForUserData(system, userIdentifiers)
      
      if (foundData.length > 0) {
        zombieDataSources.push(system)
        this.logger.warn('Zombie data detected', {
          originalWorkflowId,
          system,
          dataCount: foundData.length
        })
      }
    }

    const zombieDataDetected = zombieDataSources.length > 0

    let newWorkflowId: string | undefined
    let alertSent = false

    if (zombieDataDetected) {
      // Spawn new erasure workflow
      newWorkflowId = uuidv4()
      
      const newWorkflow = {
        workflowId: newWorkflowId,
        originalWorkflowId,
        userIdentifiers,
        reason: 'ZOMBIE_DATA_DETECTED',
        zombieDataSources,
        createdAt: checkTimestamp,
        status: 'IN_PROGRESS'
      }

      await this.state.set('workflows', newWorkflowId, newWorkflow)
      this.workflowsSpawned.push(newWorkflow)

      // Send alert to legal teams
      const alert = {
        alertId: uuidv4(),
        type: 'ZOMBIE_DATA_DETECTED',
        originalWorkflowId,
        newWorkflowId,
        userIdentifiers,
        zombieDataSources,
        timestamp: checkTimestamp,
        severity: 'HIGH'
      }

      await this.state.set('alerts', alert.alertId, alert)
      this.alertsSent.push(alert)
      alertSent = true

      this.logger.error('Zombie data detected - new workflow spawned and alert sent', {
        originalWorkflowId,
        newWorkflowId,
        zombieDataSources
      })
    } else {
      this.logger.info('No zombie data detected', {
        originalWorkflowId,
        systemsChecked: systemsToCheck.length
      })
    }

    return {
      zombieDataDetected,
      zombieDataSources,
      newWorkflowId,
      alertSent,
      checkTimestamp
    }
  }

  getAlertsSent(): any[] {
    return this.alertsSent
  }

  getWorkflowsSpawned(): any[] {
    return this.workflowsSpawned
  }
}

describe('Property 23: Zombie Detection and Response', () => {
  let state: MockStateManager
  let scanner: MockSystemScanner
  let service: ZombieDetectionService
  let logger: any

  beforeEach(() => {
    state = new MockStateManager()
    scanner = new MockSystemScanner()
    logger = {
      info: () => {},
      warn: () => {},
      error: () => {}
    }
    service = new ZombieDetectionService(state, scanner, logger)
  })

  it('should spawn new workflow and alert when zombie data is detected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.array(fc.emailAddress(), { minLength: 1, maxLength: 5 }),
        fc.array(fc.constantFrom('stripe', 'database', 'intercom', 'sendgrid', 'crm'), { minLength: 1, maxLength: 5 }),
        fc.constantFrom('stripe', 'database', 'intercom', 'sendgrid', 'crm'),
        async (workflowId, userId, emails, systemsToCheck, zombieSystem) => {
          // Arrange
          const userIdentifiers = {
            userId,
            emails,
            phones: [],
            aliases: []
          }

          // Inject zombie data in one system
          scanner.setMockData(zombieSystem, [
            { userId, email: emails[0], data: 'zombie data' }
          ])

          // Act
          const result = await service.performZombieCheck(
            workflowId,
            userIdentifiers,
            systemsToCheck
          )

          // Assert
          if (systemsToCheck.includes(zombieSystem)) {
            // Zombie data should be detected
            expect(result.zombieDataDetected).toBe(true)
            expect(result.zombieDataSources).toContain(zombieSystem)
            expect(result.newWorkflowId).toBeDefined()
            expect(result.alertSent).toBe(true)

            // Verify new workflow was spawned
            const newWorkflow = await state.get('workflows', result.newWorkflowId!)
            expect(newWorkflow).toBeDefined()
            expect(newWorkflow.originalWorkflowId).toBe(workflowId)
            expect(newWorkflow.reason).toBe('ZOMBIE_DATA_DETECTED')
            expect(newWorkflow.zombieDataSources).toContain(zombieSystem)

            // Verify alert was sent
            const alerts = service.getAlertsSent()
            expect(alerts.length).toBeGreaterThan(0)
            const alert = alerts[alerts.length - 1]
            expect(alert.type).toBe('ZOMBIE_DATA_DETECTED')
            expect(alert.originalWorkflowId).toBe(workflowId)
            expect(alert.newWorkflowId).toBe(result.newWorkflowId)
            expect(alert.severity).toBe('HIGH')
          } else {
            // Zombie data should not be detected (system not checked)
            expect(result.zombieDataDetected).toBe(false)
            expect(result.newWorkflowId).toBeUndefined()
            expect(result.alertSent).toBe(false)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should not spawn workflow or alert when no zombie data is detected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.array(fc.emailAddress(), { minLength: 1, maxLength: 5 }),
        fc.array(fc.constantFrom('stripe', 'database', 'intercom', 'sendgrid', 'crm'), { minLength: 1, maxLength: 5 }),
        async (workflowId, userId, emails, systemsToCheck) => {
          // Arrange
          const userIdentifiers = {
            userId,
            emails,
            phones: [],
            aliases: []
          }

          // No zombie data in any system
          for (const system of systemsToCheck) {
            scanner.setMockData(system, [])
          }

          // Act
          const result = await service.performZombieCheck(
            workflowId,
            userIdentifiers,
            systemsToCheck
          )

          // Assert
          expect(result.zombieDataDetected).toBe(false)
          expect(result.zombieDataSources).toEqual([])
          expect(result.newWorkflowId).toBeUndefined()
          expect(result.alertSent).toBe(false)

          // Verify no workflows were spawned
          const workflows = service.getWorkflowsSpawned()
          expect(workflows.length).toBe(0)

          // Verify no alerts were sent
          const alerts = service.getAlertsSent()
          expect(alerts.length).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should detect zombie data in multiple systems and include all in alert', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.array(fc.emailAddress(), { minLength: 1, maxLength: 5 }),
        fc.uniqueArray(fc.constantFrom('stripe', 'database', 'intercom', 'sendgrid', 'crm'), { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 1, max: 3 }),
        async (workflowId, userId, emails, systemsToCheck, numZombieSystems) => {
          // Arrange
          const userIdentifiers = {
            userId,
            emails,
            phones: [],
            aliases: []
          }

          // Inject zombie data in multiple systems (ensure unique)
          const uniqueZombieSystems = Array.from(new Set(systemsToCheck.slice(0, Math.min(numZombieSystems, systemsToCheck.length))))
          for (const system of uniqueZombieSystems) {
            scanner.setMockData(system, [
              { userId, email: emails[0], data: 'zombie data' }
            ])
          }

          // Act
          const result = await service.performZombieCheck(
            workflowId,
            userIdentifiers,
            systemsToCheck
          )

          // Assert
          expect(result.zombieDataDetected).toBe(true)
          expect(result.zombieDataSources.length).toBe(uniqueZombieSystems.length)
          
          // All zombie systems should be in the sources list
          for (const zombieSystem of uniqueZombieSystems) {
            expect(result.zombieDataSources).toContain(zombieSystem)
          }

          // Verify alert includes all zombie systems
          const alerts = service.getAlertsSent()
          const alert = alerts[alerts.length - 1]
          expect(alert.zombieDataSources).toEqual(result.zombieDataSources)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should maintain referential integrity between original and new workflow', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.array(fc.emailAddress(), { minLength: 1, maxLength: 5 }),
        fc.array(fc.constantFrom('stripe', 'database', 'intercom', 'sendgrid', 'crm'), { minLength: 1, maxLength: 5 }),
        async (workflowId, userId, emails, systemsToCheck) => {
          // Arrange
          const userIdentifiers = {
            userId,
            emails,
            phones: [],
            aliases: []
          }

          // Inject zombie data
          scanner.setMockData(systemsToCheck[0], [
            { userId, email: emails[0], data: 'zombie data' }
          ])

          // Act
          const result = await service.performZombieCheck(
            workflowId,
            userIdentifiers,
            systemsToCheck
          )

          // Assert
          if (result.zombieDataDetected) {
            const newWorkflow = await state.get('workflows', result.newWorkflowId!)
            
            // Verify referential integrity
            expect(newWorkflow.originalWorkflowId).toBe(workflowId)
            expect(newWorkflow.userIdentifiers).toEqual(userIdentifiers)
            expect(newWorkflow.reason).toBe('ZOMBIE_DATA_DETECTED')
            
            // Verify alert references both workflows
            const alerts = service.getAlertsSent()
            const alert = alerts[alerts.length - 1]
            expect(alert.originalWorkflowId).toBe(workflowId)
            expect(alert.newWorkflowId).toBe(result.newWorkflowId)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
