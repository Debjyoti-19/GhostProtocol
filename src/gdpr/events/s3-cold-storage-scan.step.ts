/**
 * S3 Cold Storage Scan Event Step
 * 
 * Handles scanning of S3 cold storage for PII data with checkpoint-based resumability.
 * This step is triggered when a workflow needs to scan backup files in S3.
 */

import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
// Simple error class for this step
class BackgroundJobError extends Error {
  constructor(jobId: string, jobType: string, message: string) {
    super(`${jobType} job ${jobId}: ${message}`)
    this.name = 'BackgroundJobError'
  }
}

// Input schema for S3 scan requests
const S3ScanInputSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  bucketName: z.string().min(1, 'Bucket name is required'),
  prefix: z.string().optional(),
  userIdentifiers: z.object({
    userId: z.string().min(1, 'User ID is required'),
    emails: z.array(z.string().email('Invalid email format')),
    phones: z.array(z.string()),
    aliases: z.array(z.string())
  }),
  resumeFromCheckpoint: z.string().optional()
})

// Output schema for S3 scan results
const S3ScanOutputSchema = z.object({
  jobId: z.string().uuid('Invalid job ID format'),
  workflowId: z.string().uuid('Invalid workflow ID format'),
  status: z.enum(['STARTED', 'RESUMED', 'COMPLETED', 'FAILED']),
  bucketName: z.string(),
  totalFilesScanned: z.number().int().min(0),
  piiFindings: z.array(z.object({
    matchId: z.string().uuid(),
    location: z.string(),
    piiType: z.enum(['email', 'name', 'phone', 'address', 'custom']),
    confidence: z.number().min(0).max(1),
    snippet: z.string()
  })),
  checkpoints: z.array(z.string()),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional()
})

type S3ScanInput = z.infer<typeof S3ScanInputSchema>
type S3ScanOutput = z.infer<typeof S3ScanOutputSchema>

export const config = {
  name: 'S3ColdStorageScan',
  type: 'event' as const,
  description: 'Handles scanning of S3 cold storage for PII data with checkpoint-based resumability',
  flows: ['erasure-workflow'],
  subscribes: ['s3-cold-storage-scan'],
  emits: [
    {
      topic: 'pii-deletion-required',
      label: 'PII Deletion Required'
    },
    {
      topic: 'background-job-progress',
      label: 'Background Job Progress'
    }
  ],
  input: S3ScanInputSchema
}

export async function handler(input: S3ScanInput, { emit, logger }: any): Promise<void> {
  const { workflowId, bucketName, prefix, userIdentifiers, resumeFromCheckpoint } = input

  logger?.info('Starting S3 cold storage scan', { 
    workflowId, 
    bucketName, 
    prefix,
    isResume: !!resumeFromCheckpoint 
  })

  try {
    // Create simplified mock implementations
    const jobManager = {
      createJob: async () => ({
        jobId: uuidv4(),
        type: 'S3_SCAN' as const,
        workflowId,
        status: 'PENDING' as const,
        progress: 0,
        checkpoints: [],
        findings: []
      }),
      startJob: async (jobId: string) => {
        logger?.info('Starting S3 scan job', { jobId })
        return Promise.resolve()
      }
    }

    // Check if we're resuming an existing job
    let jobId: string
    let isResume = false

    if (resumeFromCheckpoint) {
      // Find existing job for this workflow
      const workflowState = await workflowStateManager.getWorkflowState(workflowId)
      const existingJob = Object.values(workflowState.backgroundJobs).find(
        job => job.type === 'S3_SCAN' && job.checkpoints.includes(resumeFromCheckpoint)
      )
      
      if (existingJob) {
        jobId = existingJob.jobId
        isResume = true
      } else {
        throw new BackgroundJobError(
          'unknown', 
          'S3_SCAN', 
          `Checkpoint ${resumeFromCheckpoint} not found`
        )
      }
    } else {
      // Create new background job
      const job = await jobManager.createJob({
        workflowId,
        type: 'S3_SCAN',
        scanTarget: `s3://${bucketName}${prefix ? '/' + prefix : ''}`,
        batchSize: 100,
        checkpointInterval: 50
      })
      jobId = job.jobId
    }

    // Start the job asynchronously (don't await - it runs in background)
    jobManager.startJob(jobId).catch(error => {
      console.error(`S3 scan job ${jobId} failed:`, error)
      // Emit error event for monitoring
      emit('background-job-progress', {
        jobId,
        workflowId,
        status: 'FAILED',
        error: error.message
      })
    })

    // Set up progress monitoring
    const progressInterval = setInterval(async () => {
      try {
        const jobStatus = await jobManager.getJobStatus(jobId)
        
        // Emit progress update
        await emit('background-job-progress', {
          jobId,
          workflowId,
          status: jobStatus.status,
          progress: jobStatus.progress,
          findings: jobStatus.findings.length
        })

        // Check for PII findings that need deletion
        for (const finding of jobStatus.findings) {
          if (finding.confidence >= 0.8) {
            await emit('pii-deletion-required', {
              workflowId,
              finding,
              source: 'S3_SCAN',
              autoDelete: true
            })
          } else if (finding.confidence >= 0.5) {
            await emit('pii-deletion-required', {
              workflowId,
              finding,
              source: 'S3_SCAN',
              autoDelete: false,
              requiresManualReview: true
            })
          }
        }

        // Clear interval when job is complete
        if (jobStatus.status === 'COMPLETED' || jobStatus.status === 'FAILED') {
          clearInterval(progressInterval)
        }
      } catch (error) {
        console.error(`Error monitoring job ${jobId}:`, error)
        clearInterval(progressInterval)
      }
    }, 5000) // Check every 5 seconds

    // Return immediate response
    return {
      jobId,
      workflowId,
      status: isResume ? 'RESUMED' : 'STARTED',
      bucketName,
      totalFilesScanned: 0, // Will be updated via progress events
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
      bucketName,
      totalFilesScanned: 0,
      piiFindings: [],
      checkpoints: [],
      error: errorMessage
    }
  }
}