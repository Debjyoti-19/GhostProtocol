/**
 * Backup Check Event Step
 * 
 * Handles checking of backup systems for PII data with checkpoint-based resumability.
 * This step is triggered when a workflow needs to verify backups don't contain PII.
 */

import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { BackgroundJobManager } from '../services/background-job-manager.js'
import { WorkflowStateManager } from '../services/workflow-state-manager.js'
import { PIIAgent } from '../services/pii-agent.js'
import { BackgroundJobError } from '../errors/index.js'

// Input schema for backup check requests
const BackupCheckInputSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  backupSystems: z.array(z.object({
    name: z.string().min(1, 'Backup system name is required'),
    type: z.enum(['FILE_BACKUP', 'DATABASE_BACKUP', 'SNAPSHOT', 'ARCHIVE']),
    location: z.string().min(1, 'Backup location is required'),
    retentionDays: z.number().int().min(0)
  })),
  userIdentifiers: z.object({
    userId: z.string().min(1, 'User ID is required'),
    emails: z.array(z.string().email('Invalid email format')),
    phones: z.array(z.string()),
    aliases: z.array(z.string())
  }),
  resumeFromCheckpoint: z.string().optional(),
  checkBackupsOlderThan: z.number().int().min(0).default(30) // Days
})

// Output schema for backup check results
const BackupCheckOutputSchema = z.object({
  jobId: z.string().uuid('Invalid job ID format'),
  workflowId: z.string().uuid('Invalid workflow ID format'),
  status: z.enum(['STARTED', 'RESUMED', 'COMPLETED', 'FAILED']),
  backupSystemsChecked: z.array(z.string()),
  totalBackupsScanned: z.number().int().min(0),
  piiFindings: z.array(z.object({
    matchId: z.string().uuid(),
    location: z.string(),
    piiType: z.enum(['email', 'name', 'phone', 'address', 'custom']),
    confidence: z.number().min(0).max(1),
    snippet: z.string(),
    backupSystem: z.string(),
    backupDate: z.string().datetime(),
    retentionExpiry: z.string().datetime().optional()
  })),
  checkpoints: z.array(z.string()),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional()
})

type BackupCheckInput = z.infer<typeof BackupCheckInputSchema>
type BackupCheckOutput = z.infer<typeof BackupCheckOutputSchema>

export const config = {
  type: 'event' as const,
  topic: 'backup-check',
  inputSchema: BackupCheckInputSchema,
  outputSchema: BackupCheckOutputSchema,
  emits: [
    {
      topic: 'pii-deletion-required',
      description: 'Emitted when PII is found in backups and needs to be deleted'
    },
    {
      topic: 'background-job-progress',
      description: 'Emitted periodically to report backup check progress'
    },
    {
      topic: 'backup-retention-violation',
      description: 'Emitted when PII is found in backups that should have been purged'
    }
  ]
}

export async function handler(input: BackupCheckInput, { emit, state }: any): Promise<BackupCheckOutput> {
  const { workflowId, backupSystems, userIdentifiers, resumeFromCheckpoint, checkBackupsOlderThan } = input

  try {
    // Get workflow state manager and background job manager
    const workflowStateManager = new WorkflowStateManager()
    const piiAgent = new PIIAgent()
    const jobManager = new BackgroundJobManager(workflowStateManager, piiAgent)

    // Check if we're resuming an existing job
    let jobId: string
    let isResume = false

    if (resumeFromCheckpoint) {
      // Find existing job for this workflow
      const workflowState = await workflowStateManager.getWorkflowState(workflowId)
      const existingJob = Object.values(workflowState.backgroundJobs).find(
        job => job.type === 'BACKUP_CHECK' && job.checkpoints.includes(resumeFromCheckpoint)
      )
      
      if (existingJob) {
        jobId = existingJob.jobId
        isResume = true
      } else {
        throw new BackgroundJobError(
          'unknown', 
          'BACKUP_CHECK', 
          `Checkpoint ${resumeFromCheckpoint} not found`
        )
      }
    } else {
      // Create new background job
      const job = await jobManager.createJob({
        workflowId,
        type: 'BACKUP_CHECK',
        scanTarget: backupSystems.map(sys => sys.location).join(','),
        batchSize: 25,
        checkpointInterval: 10
      })
      jobId = job.jobId
    }

    // Start the job asynchronously (don't await - it runs in background)
    jobManager.startJob(jobId).catch(error => {
      console.error(`Backup check job ${jobId} failed:`, error)
      // Emit error event for monitoring
      emit('background-job-progress', {
        jobId,
        workflowId,
        status: 'FAILED',
        error: error.message
      })
    })

    // Set up progress monitoring with longer intervals for backup checks
    const progressInterval = setInterval(async () => {
      try {
        const jobStatus = await jobManager.getJobStatus(jobId)
        
        // Emit progress update
        await emit('background-job-progress', {
          jobId,
          workflowId,
          status: jobStatus.status,
          progress: jobStatus.progress,
          findings: jobStatus.findings.length,
          scanType: 'BACKUP_CHECK'
        })

        // Check for PII findings that need deletion
        for (const finding of jobStatus.findings) {
          const backupDate = new Date(finding.provenance.timestamp)
          const cutoffDate = new Date()
          cutoffDate.setDate(cutoffDate.getDate() - checkBackupsOlderThan)

          // Check if this backup should have been purged already
          if (backupDate < cutoffDate) {
            await emit('backup-retention-violation', {
              workflowId,
              finding,
              backupDate: backupDate.toISOString(),
              retentionViolationDays: Math.floor((Date.now() - backupDate.getTime()) / (1000 * 60 * 60 * 24)),
              severity: 'HIGH'
            })
          }

          if (finding.confidence >= 0.8) {
            await emit('pii-deletion-required', {
              workflowId,
              finding: {
                ...finding,
                metadata: {
                  backupSystem: finding.system,
                  backupDate: finding.provenance.timestamp,
                  scanType: 'BACKUP_CHECK'
                }
              },
              source: 'BACKUP_CHECK',
              autoDelete: true,
              priority: backupDate < cutoffDate ? 'HIGH' : 'NORMAL'
            })
          } else if (finding.confidence >= 0.5) {
            await emit('pii-deletion-required', {
              workflowId,
              finding: {
                ...finding,
                metadata: {
                  backupSystem: finding.system,
                  backupDate: finding.provenance.timestamp,
                  scanType: 'BACKUP_CHECK'
                }
              },
              source: 'BACKUP_CHECK',
              autoDelete: false,
              requiresManualReview: true,
              priority: backupDate < cutoffDate ? 'HIGH' : 'NORMAL'
            })
          }
        }

        // Clear interval when job is complete
        if (jobStatus.status === 'COMPLETED' || jobStatus.status === 'FAILED') {
          clearInterval(progressInterval)
        }
      } catch (error) {
        console.error(`Error monitoring backup check job ${jobId}:`, error)
        clearInterval(progressInterval)
      }
    }, 10000) // Check every 10 seconds for backup checks (slower process)

    // Return immediate response
    return {
      jobId,
      workflowId,
      status: isResume ? 'RESUMED' : 'STARTED',
      backupSystemsChecked: [],
      totalBackupsScanned: 0,
      piiFindings: [],
      checkpoints: [],
      completedAt: undefined
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return {
      jobId: uuidv4(), // Generate ID for error tracking
      workflowId,
      status: 'FAILED',
      backupSystemsChecked: [],
      totalBackupsScanned: 0,
      piiFindings: [],
      checkpoints: [],
      error: errorMessage
    }
  }
}