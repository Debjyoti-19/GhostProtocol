/**
 * Zombie Check Scheduler Service
 * 
 * Schedules zombie data checks for completed erasure workflows.
 * Zombie checks verify that deleted data hasn't reappeared from backups or other sources.
 * 
 * Requirements: 8.1
 */

import { StateManager } from 'motia'
import { v4 as uuidv4 } from 'uuid'
import { UserIdentifiers } from '../types/index.js'
import { ghostProtocolConfig } from '../config/index.js'

export interface ZombieCheckSchedule {
  scheduleId: string
  workflowId: string
  userIdentifiers: UserIdentifiers
  scheduledFor: string
  createdAt: string
  status: 'SCHEDULED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  zombieCheckInterval: number
  systemsToCheck: string[]
  jurisdiction?: 'EU' | 'US' | 'OTHER'
  zombieDataDetected?: boolean
  zombieDataSources?: string[]
  completedAt?: string
  failedAt?: string
  error?: string
}

export class ZombieCheckScheduler {
  private state: StateManager
  private logger: any

  constructor(state: StateManager, logger: any) {
    this.state = state
    this.logger = logger
  }

  /**
   * Schedules a zombie check for a completed workflow
   * 
   * Requirement 8.1: WHEN an erasure workflow completes, THE Workflow_Engine SHALL 
   * schedule a zombie data check for 30 days later using cron scheduling
   */
  async scheduleZombieCheck(
    workflowId: string,
    userIdentifiers: UserIdentifiers,
    completedAt: string,
    options: {
      zombieCheckInterval?: number
      systemsToCheck?: string[]
      jurisdiction?: 'EU' | 'US' | 'OTHER'
    } = {}
  ): Promise<ZombieCheckSchedule> {
    const scheduleId = uuidv4()
    const zombieCheckInterval = options.zombieCheckInterval || ghostProtocolConfig.workflow.defaultZombieCheckInterval
    
    // Calculate scheduled date (default 30 days after completion)
    const completedDate = new Date(completedAt)
    const scheduledDate = new Date(completedDate.getTime() + zombieCheckInterval * 24 * 60 * 60 * 1000)
    const scheduledFor = scheduledDate.toISOString()
    const createdAt = new Date().toISOString()

    const schedule: ZombieCheckSchedule = {
      scheduleId,
      workflowId,
      userIdentifiers,
      scheduledFor,
      createdAt,
      status: 'SCHEDULED',
      zombieCheckInterval,
      systemsToCheck: options.systemsToCheck || [
        'stripe',
        'database',
        'intercom',
        'sendgrid',
        'crm',
        'analytics'
      ],
      jurisdiction: options.jurisdiction
    }

    // Store the schedule
    await this.state.set('zombie_check_schedules', scheduleId, schedule)
    
    // Also index by workflow ID for easy lookup
    await this.state.set('zombie_checks_by_workflow', workflowId, scheduleId)

    this.logger.info('Zombie check scheduled', {
      scheduleId,
      workflowId,
      scheduledFor,
      zombieCheckInterval,
      systemsToCheck: schedule.systemsToCheck.length
    })

    return schedule
  }

  /**
   * Gets a scheduled zombie check by workflow ID
   */
  async getScheduleByWorkflowId(workflowId: string): Promise<ZombieCheckSchedule | null> {
    const scheduleId = await this.state.get('zombie_checks_by_workflow', workflowId)
    if (!scheduleId) {
      return null
    }
    return await this.state.get('zombie_check_schedules', scheduleId)
  }

  /**
   * Gets a scheduled zombie check by schedule ID
   */
  async getScheduleById(scheduleId: string): Promise<ZombieCheckSchedule | null> {
    return await this.state.get('zombie_check_schedules', scheduleId)
  }

  /**
   * Updates a zombie check schedule
   */
  async updateSchedule(scheduleId: string, updates: Partial<ZombieCheckSchedule>): Promise<ZombieCheckSchedule | null> {
    const schedule = await this.getScheduleById(scheduleId)
    if (!schedule) {
      this.logger.warn('Schedule not found for update', { scheduleId })
      return null
    }

    const updatedSchedule = {
      ...schedule,
      ...updates,
      scheduleId // Ensure ID is not overwritten
    }

    await this.state.set('zombie_check_schedules', scheduleId, updatedSchedule)

    this.logger.info('Zombie check schedule updated', {
      scheduleId,
      status: updatedSchedule.status
    })

    return updatedSchedule
  }

  /**
   * Cancels a scheduled zombie check
   */
  async cancelSchedule(scheduleId: string): Promise<boolean> {
    const schedule = await this.getScheduleById(scheduleId)
    if (!schedule) {
      this.logger.warn('Schedule not found for cancellation', { scheduleId })
      return false
    }

    if (schedule.status === 'COMPLETED') {
      this.logger.warn('Cannot cancel completed zombie check', { scheduleId })
      return false
    }

    await this.state.delete('zombie_check_schedules', scheduleId)
    await this.state.delete('zombie_checks_by_workflow', schedule.workflowId)

    this.logger.info('Zombie check schedule cancelled', {
      scheduleId,
      workflowId: schedule.workflowId
    })

    return true
  }

  /**
   * Gets all scheduled zombie checks that are due
   */
  async getDueZombieChecks(currentTime: string = new Date().toISOString()): Promise<ZombieCheckSchedule[]> {
    const allSchedules = await this.state.getGroup<ZombieCheckSchedule>('zombie_check_schedules')
    
    if (!allSchedules || allSchedules.length === 0) {
      return []
    }

    const now = new Date(currentTime)
    
    return allSchedules.filter(schedule => {
      const scheduledDate = new Date(schedule.scheduledFor)
      return (
        schedule.status === 'SCHEDULED' &&
        scheduledDate <= now
      )
    })
  }

  /**
   * Gets statistics about zombie check schedules
   */
  async getScheduleStats(): Promise<{
    total: number
    scheduled: number
    processing: number
    completed: number
    failed: number
    zombieDataDetected: number
  }> {
    const allSchedules = await this.state.getGroup<ZombieCheckSchedule>('zombie_check_schedules')
    
    if (!allSchedules || allSchedules.length === 0) {
      return {
        total: 0,
        scheduled: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        zombieDataDetected: 0
      }
    }

    return {
      total: allSchedules.length,
      scheduled: allSchedules.filter(s => s.status === 'SCHEDULED').length,
      processing: allSchedules.filter(s => s.status === 'PROCESSING').length,
      completed: allSchedules.filter(s => s.status === 'COMPLETED').length,
      failed: allSchedules.filter(s => s.status === 'FAILED').length,
      zombieDataDetected: allSchedules.filter(s => s.zombieDataDetected === true).length
    }
  }
}
