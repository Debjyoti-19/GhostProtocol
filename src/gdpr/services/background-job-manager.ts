/**
 * Background Job Manager for GhostProtocol
 * 
 * Manages resumable background jobs for cold storage scanning, data warehouse scanning,
 * and backup checking. Provides checkpoint-based resumability and progress reporting.
 */

import { v4 as uuidv4 } from 'uuid'
import { 
  BackgroundJob, 
  JobType, 
  JobStatus, 
  PIIFinding,
  WorkflowState
} from '../types/index.js'
import { WorkflowStateManager } from './workflow-state-manager.js'
import { PIIAgent } from './pii-agent.js'
import { BackgroundJobError } from '../errors/index.js'

export interface BackgroundJobCreationOptions {
  workflowId: string
  type: JobType
  scanTarget?: string // S3 bucket, database connection, etc.
  batchSize?: number
  checkpointInterval?: number
}

export interface JobCheckpoint {
  checkpointId: string
  processedItems: number
  lastProcessedKey?: string
  timestamp: string
  metadata?: Record<string, any>
}

export interface JobProgressUpdate {
  jobId: string
  progress: number
  processedItems?: number
  totalItems?: number
  currentCheckpoint?: string
  findings?: PIIFinding[]
}

/**
 * Background Job Manager
 * Handles creation, execution, and resumption of background jobs
 */
export class BackgroundJobManager {
  private workflowStateManager: WorkflowStateManager
  private piiAgent: PIIAgent
  private runningJobs: Map<string, AbortController> = new Map()

  constructor(
    workflowStateManager: WorkflowStateManager,
    piiAgent: PIIAgent
  ) {
    this.workflowStateManager = workflowStateManager
    this.piiAgent = piiAgent
  }

  /**
   * Creates a new background job
   */
  async createJob(options: BackgroundJobCreationOptions): Promise<BackgroundJob> {
    const jobId = uuidv4()
    
    const job: BackgroundJob = {
      jobId,
      type: options.type,
      workflowId: options.workflowId,
      status: 'PENDING',
      progress: 0,
      checkpoints: [],
      findings: []
    }

    // Store job to workflow mapping
    this.jobToWorkflowMap.set(jobId, options.workflowId)

    // Add job to workflow state
    await this.workflowStateManager.updateBackgroundJob(options.workflowId, job)
    
    return job
  }

  /**
   * Starts or resumes a background job
   */
  async startJob(jobId: string): Promise<void> {
    const workflowState = await this.getWorkflowStateForJob(jobId)
    const job = workflowState.backgroundJobs[jobId]
    
    if (!job) {
      throw new BackgroundJobError(jobId, 'UNKNOWN', 'Job not found')
    }

    if (job.status === 'RUNNING') {
      throw new BackgroundJobError(jobId, job.type, 'Job is already running')
    }

    if (job.status === 'COMPLETED') {
      throw new BackgroundJobError(jobId, job.type, 'Job is already completed')
    }

    // Create abort controller for job cancellation
    const abortController = new AbortController()
    this.runningJobs.set(jobId, abortController)

    try {
      // Update job status to running
      await this.updateJobStatus(job.workflowId, jobId, 'RUNNING')

      // Execute job based on type
      switch (job.type) {
        case 'S3_SCAN':
          await this.executeS3Scan(job, abortController.signal)
          break
        case 'WAREHOUSE_SCAN':
          await this.executeWarehouseScan(job, abortController.signal)
          break
        case 'BACKUP_CHECK':
          await this.executeBackupCheck(job, abortController.signal)
          break
        default:
          throw new BackgroundJobError(jobId, job.type, 'Unknown job type')
      }

      // Mark job as completed
      await this.updateJobStatus(job.workflowId, jobId, 'COMPLETED', 100)
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Job was cancelled
        await this.updateJobStatus(job.workflowId, jobId, 'FAILED')
      } else {
        // Job failed
        await this.updateJobStatus(job.workflowId, jobId, 'FAILED')
        throw new BackgroundJobError(
          jobId, 
          job.type, 
          error instanceof Error ? error.message : 'Unknown error'
        )
      }
    } finally {
      this.runningJobs.delete(jobId)
    }
  }

  /**
   * Cancels a running job
   */
  async cancelJob(jobId: string): Promise<void> {
    const abortController = this.runningJobs.get(jobId)
    if (abortController) {
      abortController.abort()
    }
  }

  /**
   * Gets job status and progress
   */
  async getJobStatus(jobId: string): Promise<BackgroundJob> {
    const workflowId = this.jobToWorkflowMap.get(jobId)
    if (!workflowId) {
      throw new BackgroundJobError(jobId, 'UNKNOWN', 'Job not found in mapping')
    }

    const workflowState = await this.workflowStateManager.getWorkflowState(workflowId)
    if (!workflowState) {
      throw new BackgroundJobError(jobId, 'UNKNOWN', 'Workflow state not found')
    }

    const job = workflowState.backgroundJobs[jobId]
    if (!job) {
      throw new BackgroundJobError(jobId, 'UNKNOWN', 'Job not found in workflow state')
    }
    
    return job
  }

  /**
   * Updates job progress and reports to workflow state
   */
  async updateJobProgress(update: JobProgressUpdate): Promise<void> {
    const workflowId = this.jobToWorkflowMap.get(update.jobId)
    if (!workflowId) {
      throw new BackgroundJobError(update.jobId, 'UNKNOWN', 'Job not found in mapping')
    }

    const workflowState = await this.workflowStateManager.getWorkflowState(workflowId)
    if (!workflowState) {
      throw new BackgroundJobError(update.jobId, 'UNKNOWN', 'Workflow state not found')
    }

    const job = workflowState.backgroundJobs[update.jobId]
    if (!job) {
      throw new BackgroundJobError(update.jobId, 'UNKNOWN', 'Job not found in workflow state')
    }

    // Update job with new progress (ensure monotonic progress)
    const updatedJob: BackgroundJob = {
      ...job,
      progress: Math.max(job.progress, update.progress), // Ensure progress never decreases
      findings: update.findings ? [...job.findings, ...update.findings] : job.findings,
      checkpoints: update.currentCheckpoint 
        ? [...job.checkpoints, update.currentCheckpoint]
        : job.checkpoints
    }

    await this.workflowStateManager.updateBackgroundJob(workflowId, updatedJob)
  }

  /**
   * Creates a checkpoint for resumability
   */
  async createCheckpoint(
    jobId: string, 
    processedItems: number, 
    lastProcessedKey?: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const checkpointId = `checkpoint_${Date.now()}_${processedItems}`
    const checkpoint: JobCheckpoint = {
      checkpointId,
      processedItems,
      lastProcessedKey,
      timestamp: new Date().toISOString(),
      metadata
    }

    await this.updateJobProgress({
      jobId,
      progress: Math.min(100, Math.floor((processedItems / 1000) * 100)), // Rough progress estimate
      currentCheckpoint: checkpointId
    })

    return checkpointId
  }

  /**
   * Checks if all background jobs for a workflow are complete
   */
  async areAllJobsComplete(workflowId: string): Promise<boolean> {
    const workflowState = await this.workflowStateManager.getWorkflowState(workflowId)
    const jobs = Object.values(workflowState.backgroundJobs)
    
    if (jobs.length === 0) {
      return true // No jobs means complete
    }
    
    return jobs.every(job => 
      job.status === 'COMPLETED' || job.status === 'FAILED'
    )
  }

  /**
   * Gets all PII findings from completed jobs
   */
  async getAllFindings(workflowId: string): Promise<PIIFinding[]> {
    const workflowState = await this.workflowStateManager.getWorkflowState(workflowId)
    const jobs = Object.values(workflowState.backgroundJobs)
    
    return jobs.flatMap(job => job.findings)
  }

  // Private helper methods

  private async getWorkflowStateForJob(jobId: string): Promise<WorkflowState> {
    // In a real implementation, we might need to index jobs by ID
    // For testing purposes, we'll search through all workflows
    // This is a simplified implementation that would need optimization in production
    
    // For now, we'll store a mapping of jobId to workflowId
    // This would be handled by a proper database in production
    const jobToWorkflowMap = this.jobToWorkflowMap || new Map<string, string>()
    const workflowId = jobToWorkflowMap.get(jobId)
    
    if (!workflowId) {
      throw new Error(`No workflow found for job ${jobId}`)
    }
    
    const workflowState = await this.workflowStateManager.getWorkflowState(workflowId)
    if (!workflowState) {
      throw new Error(`Workflow state not found for workflow ${workflowId}`)
    }
    
    return workflowState
  }

  private jobToWorkflowMap = new Map<string, string>()

  private async updateJobStatus(
    workflowId: string, 
    jobId: string, 
    status: JobStatus, 
    progress?: number
  ): Promise<void> {
    const workflowState = await this.workflowStateManager.getWorkflowState(workflowId)
    const job = workflowState.backgroundJobs[jobId]
    
    if (!job) {
      throw new BackgroundJobError(jobId, 'UNKNOWN', 'Job not found')
    }

    const updatedJob: BackgroundJob = {
      ...job,
      status,
      progress: progress !== undefined ? progress : job.progress
    }

    await this.workflowStateManager.updateBackgroundJob(workflowId, updatedJob)
  }

  private async executeS3Scan(job: BackgroundJob, signal: AbortSignal): Promise<void> {
    // Mock S3 scanning implementation
    // In a real implementation, this would:
    // 1. Connect to S3 using AWS SDK
    // 2. List objects in the bucket
    // 3. Download and scan files for PII
    // 4. Create checkpoints for resumability
    // 5. Report progress periodically
    
    const totalItems = 100 // Mock total
    let processedItems = 0
    
    // Resume from last checkpoint if available
    const lastCheckpoint = job.checkpoints[job.checkpoints.length - 1]
    if (lastCheckpoint) {
      const match = lastCheckpoint.match(/checkpoint_\d+_(\d+)/)
      if (match) {
        processedItems = parseInt(match[1])
      }
    }

    while (processedItems < totalItems && !signal.aborted) {
      // Mock processing batch
      await new Promise(resolve => setTimeout(resolve, 100))
      
      processedItems += 10
      const progress = Math.floor((processedItems / totalItems) * 100)
      
      // Create checkpoint every 20 items
      if (processedItems % 20 === 0) {
        await this.createCheckpoint(
          job.jobId, 
          processedItems, 
          `s3://bucket/file_${processedItems}`,
          { scanType: 'S3_SCAN', batchSize: 10 }
        )
      }

      // Mock PII finding
      if (processedItems % 30 === 0) {
        const finding: PIIFinding = {
          matchId: uuidv4(),
          system: 'S3_COLD_STORAGE',
          location: `s3://bucket/file_${processedItems}`,
          piiType: 'email',
          confidence: 0.9,
          snippet: 'user@example.com',
          provenance: {
            timestamp: new Date().toISOString()
          }
        }

        await this.updateJobProgress({
          jobId: job.jobId,
          progress,
          findings: [finding]
        })
      } else {
        await this.updateJobProgress({
          jobId: job.jobId,
          progress
        })
      }
    }
  }

  private async executeWarehouseScan(job: BackgroundJob, signal: AbortSignal): Promise<void> {
    // Mock warehouse scanning implementation
    const totalItems = 50
    let processedItems = 0
    
    while (processedItems < totalItems && !signal.aborted) {
      await new Promise(resolve => setTimeout(resolve, 150))
      
      processedItems += 5
      const progress = Math.floor((processedItems / totalItems) * 100)
      
      if (processedItems % 15 === 0) {
        await this.createCheckpoint(
          job.jobId, 
          processedItems, 
          `table_${Math.floor(processedItems / 15)}`,
          { scanType: 'WAREHOUSE_SCAN', table: `user_data_${processedItems}` }
        )
      }

      await this.updateJobProgress({
        jobId: job.jobId,
        progress
      })
    }
  }

  private async executeBackupCheck(job: BackgroundJob, signal: AbortSignal): Promise<void> {
    // Mock backup checking implementation
    const totalItems = 25
    let processedItems = 0
    
    while (processedItems < totalItems && !signal.aborted) {
      await new Promise(resolve => setTimeout(resolve, 200))
      
      processedItems += 3
      const progress = Math.floor((processedItems / totalItems) * 100)
      
      if (processedItems % 9 === 0) {
        await this.createCheckpoint(
          job.jobId, 
          processedItems, 
          `backup_${processedItems}`,
          { scanType: 'BACKUP_CHECK', backupDate: new Date().toISOString() }
        )
      }

      await this.updateJobProgress({
        jobId: job.jobId,
        progress
      })
    }
  }
}

// Singleton instance will be created when needed with proper dependencies
// This avoids circular dependency issues during module loading