/**
 * Zombie Data Detection Cron Step
 * 
 * Scheduled task that checks for "zombie data" - personal data that has reappeared
 * after deletion (typically from backup restores or data warehouse syncs).
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { CronConfig, Handlers } from 'motia'
import { z } from 'zod'

// Configuration for zombie check
const ZombieCheckConfigSchema = z.object({
  workflowId: z.string().uuid(),
  userIdentifiers: z.object({
    userId: z.string(),
    emails: z.array(z.string()),
    phones: z.array(z.string()),
    aliases: z.array(z.string())
  }),
  scheduledFor: z.string().datetime(),
  systemsToCheck: z.array(z.string()).default([
    'stripe',
    'database',
    'intercom',
    'sendgrid',
    'crm',
    'analytics'
  ])
})

export const config: CronConfig = {
  type: 'cron',
  cron: '0 */6 * * *', // Run every 6 hours to check for due zombie checks
  name: 'ZombieDataCheck',
  description: 'Checks for zombie data (reappeared personal data) after erasure workflows complete',
  emits: [
    'zombie-data-detected',
    'zombie-check-completed',
    'audit-log',
    'create-erasure-request'
  ],
}

export const handler: Handlers['ZombieDataCheck'] = async ({ logger, state, emit }) => {
  const currentTime = new Date().toISOString()
  
  logger.info('Starting zombie data check scan', { currentTime })

  try {
    // Get all scheduled zombie checks
    const schedules = await state.getGroup<any>('zombie_check_schedules')
    
    if (!schedules || schedules.length === 0) {
      logger.info('No zombie checks scheduled')
      return
    }

    logger.info('Found scheduled zombie checks', { count: schedules.length })

    // Process each due zombie check
    for (const schedule of schedules) {
      try {
        // Check if this schedule is due
        const scheduledDate = new Date(schedule.scheduledFor)
        const now = new Date(currentTime)

        if (scheduledDate > now) {
          // Not due yet
          continue
        }

        // Skip if already processed
        if (schedule.status === 'COMPLETED' || schedule.status === 'PROCESSING') {
          continue
        }

        logger.info('Processing due zombie check', {
          scheduleId: schedule.scheduleId,
          workflowId: schedule.workflowId,
          scheduledFor: schedule.scheduledFor
        })

        // Mark as processing
        await state.set(
          'zombie_check_schedules',
          schedule.scheduleId,
          { ...schedule, status: 'PROCESSING', processingStartedAt: currentTime }
        )

        // Perform zombie data scan
        const zombieDataSources: string[] = []
        const systemsToCheck = schedule.systemsToCheck || [
          'stripe',
          'database',
          'intercom',
          'sendgrid',
          'crm',
          'analytics'
        ]

        // Scan each system for the user's data
        for (const system of systemsToCheck) {
          try {
            // Check if data exists for this user in the system
            const systemKey = `${system}:user:${schedule.userIdentifiers.userId}`
            const userData = await state.get('system_data', systemKey)

            if (userData) {
              zombieDataSources.push(system)
              logger.warn('Zombie data detected', {
                workflowId: schedule.workflowId,
                system,
                userId: schedule.userIdentifiers.userId
              })
            }
          } catch (error) {
            logger.error('Error scanning system for zombie data', {
              workflowId: schedule.workflowId,
              system,
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          }
        }

        const zombieDataDetected = zombieDataSources.length > 0

        // Record audit log (Requirement 8.4, 8.5)
        await emit({
          topic: 'audit-log',
          data: {
            event: 'ZOMBIE_CHECK_COMPLETED',
            workflowId: schedule.workflowId,
            zombieDataDetected,
            zombieDataSources,
            systemsChecked: systemsToCheck,
            checkTimestamp: currentTime,
            scheduleId: schedule.scheduleId,
            metadata: {
              zombieCheckResult: zombieDataDetected ? 'POSITIVE' : 'NEGATIVE',
              systemsCheckedCount: systemsToCheck.length,
              zombieSourcesCount: zombieDataSources.length
            }
          }
        })

        if (zombieDataDetected) {
          // Requirement 8.2, 8.3: Spawn new erasure workflow and alert legal teams
          logger.error('Zombie data detected - spawning new erasure workflow', {
            originalWorkflowId: schedule.workflowId,
            zombieDataSources,
            userId: schedule.userIdentifiers.userId
          })

          // Emit zombie data detected event
          await emit({
            topic: 'zombie-data-detected',
            data: {
              originalWorkflowId: schedule.workflowId,
              userIdentifiers: schedule.userIdentifiers,
              zombieDataSources,
              systemsChecked: systemsToCheck,
              detectedAt: currentTime,
              severity: 'HIGH',
              alertLegalTeam: true
            }
          })

          // Create new erasure request
          await emit({
            topic: 'create-erasure-request',
            data: {
              userIdentifiers: schedule.userIdentifiers,
              reason: 'ZOMBIE_DATA_DETECTED',
              originalWorkflowId: schedule.workflowId,
              zombieDataSources,
              jurisdiction: schedule.jurisdiction || 'EU',
              requestedBy: {
                userId: 'system',
                role: 'AUTOMATED_ZOMBIE_DETECTION',
                organization: 'GhostProtocol'
              },
              legalProof: {
                type: 'SIGNED_REQUEST',
                evidence: `Zombie data detected in systems: ${zombieDataSources.join(', ')}`,
                verifiedAt: currentTime
              }
            }
          })

          logger.info('New erasure workflow spawned for zombie data', {
            originalWorkflowId: schedule.workflowId,
            zombieDataSources
          })
        } else {
          // No zombie data detected (Requirement 8.4)
          logger.info('No zombie data detected', {
            workflowId: schedule.workflowId,
            systemsChecked: systemsToCheck.length
          })
        }

        // Emit completion event
        await emit({
          topic: 'zombie-check-completed',
          data: {
            scheduleId: schedule.scheduleId,
            workflowId: schedule.workflowId,
            zombieDataDetected,
            zombieDataSources,
            systemsChecked: systemsToCheck,
            completedAt: currentTime
          }
        })

        // Mark schedule as completed
        await state.set(
          'zombie_check_schedules',
          schedule.scheduleId,
          {
            ...schedule,
            status: 'COMPLETED',
            completedAt: currentTime,
            zombieDataDetected,
            zombieDataSources
          }
        )

        logger.info('Zombie check completed', {
          scheduleId: schedule.scheduleId,
          workflowId: schedule.workflowId,
          zombieDataDetected,
          zombieSourcesCount: zombieDataSources.length
        })

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error('Error processing zombie check', {
          scheduleId: schedule.scheduleId,
          workflowId: schedule.workflowId,
          error: errorMessage
        })

        // Mark schedule as failed
        await state.set(
          'zombie_check_schedules',
          schedule.scheduleId,
          {
            ...schedule,
            status: 'FAILED',
            failedAt: currentTime,
            error: errorMessage
          }
        )

        // Emit audit log for failure (Requirement 8.5)
        await emit({
          topic: 'audit-log',
          data: {
            event: 'ZOMBIE_CHECK_FAILED',
            workflowId: schedule.workflowId,
            scheduleId: schedule.scheduleId,
            error: errorMessage,
            timestamp: currentTime
          }
        })
      }
    }

    logger.info('Zombie data check scan completed')

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Fatal error in zombie data check cron', { error: errorMessage })
    throw error
  }
}
