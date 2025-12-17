/**
 * Background Job Orchestrator Event Step
 * 
 * Orchestrates multiple background jobs for cold storage scanning, warehouse scanning,
 * and backup checking. Manages job lifecycle and completion detection.
 */

import { z } from 'zod'
import { BackgroundJobManager } from '../services/background-job-manager.js'
import { WorkflowStateManager } from '../services/workflow-state-manager.js'
import { PIIAgent } from '../services/pii-agent.js'

// Input schema for background job orchestration
const BackgroundJobOrchestratorInputSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  userIdentifiers: z.object({
    userId: z.string().min(1, 'User ID is required'),
    emails: z.array(z.string().email('Invalid email format')),
    phones: z.array(z.string()),
    aliases: z.array(z.string())
  }),
  scanTargets: z.object({
    s3Buckets: z.array(z.object({
      bucketName: z.string().min(1, 'Bucket name is required'),
      prefix: z.string().optional()
    })).optional(),
    warehouses: z.array(z.object({
      connectionString: z.string().min(1, 'Connection string is required'),
      tables: z.array(z.string().min(1, 'Table name cannot be empty'))
    })).optional(),
    backupSystems: z.array(z.object({
      name: z.string().min(1, 'Backup system name is required'),
      type: z.enum(['FILE_BACKUP', 'DATABASE_BACKUP', 'SNAPSHOT', 'ARCHIVE']),
      location: z.string().min(1, 'Backup location is required'),
      retentionDays: z.number().int().min(0)
    })).optional()
  }),
  parallelJobs: z.number().int().min(1).max(10).default(3)
})

// Output schema for orchestration results
const BackgroundJobOrchestratorOutputSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  status: z.enum(['STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED']),
  jobsStarted: z.array(z.object({
    jobId: z.string().uuid(),
    type: z.enum(['S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK']),
    target: z.string()
  })),
  totalJobs: z.number().int().min(0),
  completedJobs: z.number().int().min(0),
  failedJobs: z.number().int().min(0),
  totalFindings: z.number().int().min(0),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional()
})

type BackgroundJobOrchestratorInput = z.infer<typeof BackgroundJobOrchestratorInputSchema>
type BackgroundJobOrchestratorOutput = z.infer<typeof BackgroundJobOrchestratorOutputSchema>

export const config = {
  type: 'event' as const,
  topic: 'background-job-orchestrator',
  inputSchema: BackgroundJobOrchestratorInputSchema,
  outputSchema: BackgroundJobOrchestratorOutputSchema,
  emits: [
    {
      topic: 's3-cold-storage-scan',
      description: 'Triggers S3 cold storage scanning'
    },
    {
      topic: 'warehouse-scan',
      description: 'Triggers data warehouse scanning'
    },
    {
      topic: 'backup-check',
      description: 'Triggers backup system checking'
    },
    {
      topic: 'background-jobs-completed',
      description: 'Emitted when all background jobs are complete'
    }
  ]
}

export async function handler(
  input: BackgroundJobOrchestratorInput, 
  { emit, state }: any
): Promise<BackgroundJobOrchestratorOutput> {
  const { workflowId, userIdentifiers, scanTargets, parallelJobs } = input
  const startedAt = new Date().toISOString()

  try {
    const jobsStarted: Array<{ jobId: string; type: 'S3_SCAN' | 'WAREHOUSE_SCAN' | 'BACKUP_CHECK'; target: string }> = []
    let totalJobs = 0

    // Count total jobs needed
    if (scanTargets.s3Buckets) totalJobs += scanTargets.s3Buckets.length
    if (scanTargets.warehouses) totalJobs += scanTargets.warehouses.length
    if (scanTargets.backupSystems) totalJobs += scanTargets.backupSystems.length

    if (totalJobs === 0) {
      return {
        workflowId,
        status: 'COMPLETED',
        jobsStarted: [],
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        totalFindings: 0,
        startedAt,
        completedAt: startedAt
      }
    }

    // Start S3 scanning jobs
    if (scanTargets.s3Buckets) {
      for (const bucket of scanTargets.s3Buckets) {
        const s3ScanResult = await emit('s3-cold-storage-scan', {
          workflowId,
          bucketName: bucket.bucketName,
          prefix: bucket.prefix,
          userIdentifiers
        })

        jobsStarted.push({
          jobId: s3ScanResult.jobId,
          type: 'S3_SCAN',
          target: `s3://${bucket.bucketName}${bucket.prefix ? '/' + bucket.prefix : ''}`
        })
      }
    }

    // Start warehouse scanning jobs
    if (scanTargets.warehouses) {
      for (const warehouse of scanTargets.warehouses) {
        const warehouseScanResult = await emit('warehouse-scan', {
          workflowId,
          connectionString: warehouse.connectionString,
          tables: warehouse.tables,
          userIdentifiers
        })

        jobsStarted.push({
          jobId: warehouseScanResult.jobId,
          type: 'WAREHOUSE_SCAN',
          target: warehouse.connectionString.replace(/password=[^;]+/i, 'password=***')
        })
      }
    }

    // Start backup checking jobs
    if (scanTargets.backupSystems) {
      const backupCheckResult = await emit('backup-check', {
        workflowId,
        backupSystems: scanTargets.backupSystems,
        userIdentifiers
      })

      jobsStarted.push({
        jobId: backupCheckResult.jobId,
        type: 'BACKUP_CHECK',
        target: scanTargets.backupSystems.map(sys => sys.location).join(', ')
      })
    }

    // Set up monitoring for job completion
    const monitoringInterval = setInterval(async () => {
      try {
        const workflowStateManager = new WorkflowStateManager()
        const piiAgent = new PIIAgent()
        const jobManager = new BackgroundJobManager(workflowStateManager, piiAgent)

        const allComplete = await jobManager.areAllJobsComplete(workflowId)
        
        if (allComplete) {
          clearInterval(monitoringInterval)
          
          // Get final statistics
          const allFindings = await jobManager.getAllFindings(workflowId)
          
          await emit('background-jobs-completed', {
            workflowId,
            totalJobs,
            totalFindings: allFindings.length,
            completedAt: new Date().toISOString(),
            findings: allFindings
          })
        }
      } catch (error) {
        console.error(`Error monitoring background jobs for workflow ${workflowId}:`, error)
        clearInterval(monitoringInterval)
      }
    }, 15000) // Check every 15 seconds

    return {
      workflowId,
      status: 'STARTED',
      jobsStarted,
      totalJobs,
      completedJobs: 0,
      failedJobs: 0,
      totalFindings: 0,
      startedAt
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return {
      workflowId,
      status: 'FAILED',
      jobsStarted: [],
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      totalFindings: 0,
      startedAt,
      error: errorMessage
    }
  }
}