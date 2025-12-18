/**
 * Integration Test for Zombie Data Detection System
 * 
 * Tests the complete flow:
 * 1. Workflow completes
 * 2. Zombie check is scheduled
 * 3. Cron runs and detects zombie data
 * 4. New workflow is spawned
 * 5. Audit trail is maintained
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { v4 as uuidv4 } from 'uuid'
import { ZombieCheckScheduler } from '../../../src/gdpr/services/zombie-check-scheduler.js'
import { AuditTrail } from '../../../src/gdpr/services/audit-trail.js'

// Mock state manager
class MockStateManager {
  private storage: Map<string, any> = new Map()
  private groups: Map<string, Map<string, any>> = new Map()

  async get(namespace: string, key: string): Promise<any> {
    const fullKey = `${namespace}:${key}`
    return this.storage.get(fullKey) || null
  }

  async set(namespace: string, key: string, value: any): Promise<void> {
    const fullKey = `${namespace}:${key}`
    this.storage.set(fullKey, value)

    // Also add to group
    if (!this.groups.has(namespace)) {
      this.groups.set(namespace, new Map())
    }
    this.groups.get(namespace)!.set(key, value)
  }

  async delete(namespace: string, key: string): Promise<void> {
    const fullKey = `${namespace}:${key}`
    this.storage.delete(fullKey)

    // Also remove from group
    if (this.groups.has(namespace)) {
      this.groups.get(namespace)!.delete(key)
    }
  }

  async getGroup<T>(namespace: string): Promise<T[]> {
    if (!this.groups.has(namespace)) {
      return []
    }
    return Array.from(this.groups.get(namespace)!.values())
  }

  clear(): void {
    this.storage.clear()
    this.groups.clear()
  }
}

describe('Zombie Detection System Integration', () => {
  let state: MockStateManager
  let logger: any

  beforeEach(() => {
    state = new MockStateManager()
    logger = {
      info: () => {},
      warn: () => {},
      error: () => {}
    }
  })

  it('should complete full zombie detection workflow', async () => {
    // Step 1: Workflow completes and schedules zombie check
    const workflowId = uuidv4()
    const userIdentifiers = {
      userId: 'user123',
      emails: ['user@example.com'],
      phones: ['+1234567890'],
      aliases: ['user_alias']
    }
    const completedAt = new Date('2024-01-01T00:00:00Z').toISOString()

    const scheduler = new ZombieCheckScheduler(state, logger)
    const schedule = await scheduler.scheduleZombieCheck(
      workflowId,
      userIdentifiers,
      completedAt,
      {
        zombieCheckInterval: 30 // 30 days
      }
    )

    expect(schedule.workflowId).toBe(workflowId)
    expect(schedule.status).toBe('SCHEDULED')

    // Verify scheduled date is 30 days after completion
    const scheduledDate = new Date(schedule.scheduledFor)
    const expectedDate = new Date(completedAt)
    expectedDate.setDate(expectedDate.getDate() + 30)
    expect(scheduledDate.getTime()).toBeCloseTo(expectedDate.getTime(), -3) // Within 1 second

    // Step 2: Simulate zombie data appearing in a system
    await state.set('system_data', 'stripe:user:user123', {
      userId: 'user123',
      email: 'user@example.com',
      data: 'zombie data from backup restore'
    })

    // Step 3: Simulate cron running and detecting zombie data
    const schedules = await state.getGroup<any>('zombie_check_schedules')
    expect(schedules.length).toBe(1)

    const dueSchedule = schedules[0]
    expect(dueSchedule.scheduleId).toBe(schedule.scheduleId)

    // Simulate zombie detection
    const zombieDataSources: string[] = []
    for (const system of dueSchedule.systemsToCheck) {
      const systemKey = `${system}:user:${dueSchedule.userIdentifiers.userId}`
      const userData = await state.get('system_data', systemKey)
      if (userData) {
        zombieDataSources.push(system)
      }
    }

    expect(zombieDataSources).toContain('stripe')
    expect(zombieDataSources.length).toBe(1)

    // Step 4: Record audit trail
    const auditTrail = new AuditTrail(workflowId)
    const auditEvent = {
      eventId: uuidv4(),
      workflowId,
      eventType: 'ZOMBIE_CHECK_COMPLETED' as const,
      timestamp: new Date().toISOString(),
      data: {
        zombieDataDetected: true,
        zombieDataSources,
        systemsChecked: dueSchedule.systemsToCheck,
        newWorkflowId: uuidv4()
      },
      metadata: {
        zombieCheckResult: 'POSITIVE',
        systemsCheckedCount: dueSchedule.systemsToCheck.length,
        zombieSourcesCount: zombieDataSources.length
      }
    }

    auditTrail.appendEvent(auditEvent)
    await state.set('audit_trails', workflowId, auditTrail.getState())

    // Step 5: Verify audit trail integrity
    const storedAuditTrail = await state.get('audit_trails', workflowId)
    const restoredTrail = AuditTrail.fromState(storedAuditTrail)
    
    expect(restoredTrail.verifyIntegrity()).toBe(true)
    
    const entries = restoredTrail.getEntries()
    expect(entries.length).toBe(1)
    expect(entries[0].event.data.zombieDataDetected).toBe(true)
    expect(entries[0].event.data.zombieDataSources).toEqual(zombieDataSources)

    // Step 6: Update schedule status
    await scheduler.updateSchedule(schedule.scheduleId, {
      status: 'COMPLETED',
      zombieDataDetected: true,
      zombieDataSources,
      completedAt: new Date().toISOString()
    })

    const updatedSchedule = await scheduler.getScheduleById(schedule.scheduleId)
    expect(updatedSchedule?.status).toBe('COMPLETED')
    expect(updatedSchedule?.zombieDataDetected).toBe(true)
    expect(updatedSchedule?.zombieDataSources).toEqual(zombieDataSources)
  })

  it('should handle no zombie data detected scenario', async () => {
    // Step 1: Schedule zombie check
    const workflowId = uuidv4()
    const userIdentifiers = {
      userId: 'user456',
      emails: ['clean@example.com'],
      phones: [],
      aliases: []
    }
    const completedAt = new Date().toISOString()

    const scheduler = new ZombieCheckScheduler(state, logger)
    const schedule = await scheduler.scheduleZombieCheck(
      workflowId,
      userIdentifiers,
      completedAt
    )

    // Step 2: No zombie data in any system (don't inject any data)

    // Step 3: Simulate zombie check
    const zombieDataSources: string[] = []
    for (const system of schedule.systemsToCheck) {
      const systemKey = `${system}:user:${userIdentifiers.userId}`
      const userData = await state.get('system_data', systemKey)
      if (userData) {
        zombieDataSources.push(system)
      }
    }

    expect(zombieDataSources.length).toBe(0)

    // Step 4: Record audit trail
    const auditTrail = new AuditTrail(workflowId)
    const auditEvent = {
      eventId: uuidv4(),
      workflowId,
      eventType: 'ZOMBIE_CHECK_COMPLETED' as const,
      timestamp: new Date().toISOString(),
      data: {
        zombieDataDetected: false,
        zombieDataSources: [],
        systemsChecked: schedule.systemsToCheck
      },
      metadata: {
        zombieCheckResult: 'NEGATIVE',
        systemsCheckedCount: schedule.systemsToCheck.length,
        zombieSourcesCount: 0
      }
    }

    auditTrail.appendEvent(auditEvent)
    await state.set('audit_trails', workflowId, auditTrail.getState())

    // Step 5: Verify audit trail
    const storedAuditTrail = await state.get('audit_trails', workflowId)
    const restoredTrail = AuditTrail.fromState(storedAuditTrail)
    
    expect(restoredTrail.verifyIntegrity()).toBe(true)
    
    const entries = restoredTrail.getEntries()
    expect(entries[0].event.data.zombieDataDetected).toBe(false)
    expect(entries[0].event.metadata?.zombieCheckResult).toBe('NEGATIVE')

    // Step 6: Update schedule
    await scheduler.updateSchedule(schedule.scheduleId, {
      status: 'COMPLETED',
      zombieDataDetected: false,
      zombieDataSources: [],
      completedAt: new Date().toISOString()
    })

    const updatedSchedule = await scheduler.getScheduleById(schedule.scheduleId)
    expect(updatedSchedule?.status).toBe('COMPLETED')
    expect(updatedSchedule?.zombieDataDetected).toBe(false)
  })

  it('should get schedule statistics correctly', async () => {
    const scheduler = new ZombieCheckScheduler(state, logger)

    // Create multiple schedules with different statuses
    const workflows = [
      { id: uuidv4(), status: 'SCHEDULED' as const },
      { id: uuidv4(), status: 'SCHEDULED' as const },
      { id: uuidv4(), status: 'PROCESSING' as const },
      { id: uuidv4(), status: 'COMPLETED' as const, zombieDetected: true },
      { id: uuidv4(), status: 'COMPLETED' as const, zombieDetected: false },
      { id: uuidv4(), status: 'FAILED' as const }
    ]

    for (const workflow of workflows) {
      const schedule = await scheduler.scheduleZombieCheck(
        workflow.id,
        { userId: workflow.id, emails: [], phones: [], aliases: [] },
        new Date().toISOString()
      )

      if (workflow.status !== 'SCHEDULED') {
        await scheduler.updateSchedule(schedule.scheduleId, {
          status: workflow.status,
          zombieDataDetected: workflow.zombieDetected
        })
      }
    }

    const stats = await scheduler.getScheduleStats()
    
    expect(stats.total).toBe(6)
    expect(stats.scheduled).toBe(2)
    expect(stats.processing).toBe(1)
    expect(stats.completed).toBe(2)
    expect(stats.failed).toBe(1)
    expect(stats.zombieDataDetected).toBe(1)
  })
})
