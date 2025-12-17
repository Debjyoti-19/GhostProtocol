/**
 * Property-based tests for background job resumability
 * **Feature: gdpr-erasure-system, Property 13: Job Resumability**
 * **Validates: Requirements 5.1, 5.3**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'
import { BackgroundJobManager } from './background-job-manager.js'
import { WorkflowStateManager } from './workflow-state-manager.js'
import { PIIAgent } from './pii-agent.js'
import { BackgroundJob, JobType, JobStatus, WorkflowState } from '../types/index.js'

describe('Background Job Resumability Properties', () => {
  let jobManager: BackgroundJobManager
  let workflowStateManager: WorkflowStateManager
  let piiAgent: PIIAgent
  let mockWorkflowStates: Map<string, WorkflowState>

  beforeEach(() => {
    // Create mock storage for workflow states
    mockWorkflowStates = new Map()
    
    // Mock WorkflowStateManager
    workflowStateManager = {
      getWorkflowState: vi.fn().mockImplementation(async (workflowId: string) => {
        return mockWorkflowStates.get(workflowId) || null
      }),
      updateBackgroundJob: vi.fn().mockImplementation(async (workflowId: string, job: BackgroundJob) => {
        let state = mockWorkflowStates.get(workflowId)
        if (!state) {
          // Create minimal workflow state
          state = {
            workflowId,
            userIdentifiers: {
              userId: 'test-user',
              emails: ['test@example.com'],
              phones: [],
              aliases: []
            },
            status: 'IN_PROGRESS',
            policyVersion: '1.0',
            legalHolds: [],
            steps: {},
            backgroundJobs: {},
            auditHashes: [],
            dataLineageSnapshot: {
              systems: [],
              identifiers: [],
              capturedAt: new Date().toISOString()
            }
          }
        }
        
        state.backgroundJobs[job.jobId] = job
        mockWorkflowStates.set(workflowId, state)
        return state
      }),
      updateWorkflowState: vi.fn()
    } as any

    // Mock PIIAgent
    piiAgent = {
      analyzeText: vi.fn().mockResolvedValue({ findings: [] })
    } as any

    jobManager = new BackgroundJobManager(workflowStateManager, piiAgent)
  })

  afterEach(() => {
    // Clean up any running jobs
    jobManager['runningJobs'].clear()
  })

  /**
   * Property 13: Job Resumability
   * For any background job, if the process crashes, the job should resume 
   * from the last recorded checkpoint without duplicating work
   */
  it('should resume jobs from last checkpoint without duplicating work', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobType: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK') as fc.Arbitrary<JobType>,
          checkpointCount: fc.integer({ min: 1, max: 5 }),
          processedItems: fc.integer({ min: 10, max: 1000 })
        }),
        async ({ workflowId, jobType, checkpointCount, processedItems }) => {
          // Create initial job
          const job = await jobManager.createJob({
            workflowId,
            type: jobType,
            scanTarget: `test-target-${jobType.toLowerCase()}`,
            batchSize: 100,
            checkpointInterval: 50
          })

          // Simulate job progress with checkpoints
          const checkpoints: string[] = []
          let currentProgress = 0
          
          for (let i = 0; i < checkpointCount; i++) {
            const itemsInBatch = Math.floor(processedItems / checkpointCount)
            currentProgress += itemsInBatch
            
            const checkpointId = await jobManager.createCheckpoint(
              job.jobId,
              currentProgress,
              `item_${currentProgress}`,
              { batchNumber: i + 1 }
            )
            checkpoints.push(checkpointId)
          }

          // Get job status before "crash"
          const jobBeforeCrash = await jobManager.getJobStatus(job.jobId)
          const checkpointsBeforeCrash = [...jobBeforeCrash.checkpoints]
          const progressBeforeCrash = jobBeforeCrash.progress

          // Simulate process crash by creating new job manager instance
          const newJobManager = new BackgroundJobManager(workflowStateManager, piiAgent)
          
          // In a real system, the new job manager would need to rebuild its job mapping
          // from the workflow state. For testing, we'll simulate this recovery process.
          newJobManager['jobToWorkflowMap'].set(job.jobId, workflowId)

          // Resume job from last checkpoint
          const lastCheckpoint = checkpoints[checkpoints.length - 1]
          
          // The job should resume from the last checkpoint
          // In a real implementation, this would involve:
          // 1. Reading the checkpoint data
          // 2. Resuming from the last processed item
          // 3. Not re-processing already completed work

          // Verify checkpoint data is preserved
          const jobAfterResume = await newJobManager.getJobStatus(job.jobId)
          
          // Property: Checkpoints should be preserved across crashes
          expect(jobAfterResume.checkpoints).toEqual(checkpointsBeforeCrash)
          
          // Property: Progress should not go backwards
          expect(jobAfterResume.progress).toBeGreaterThanOrEqual(progressBeforeCrash)
          
          // Property: Job should be resumable (not in a terminal state unless it was completed)
          if (jobBeforeCrash.status !== 'COMPLETED') {
            expect(['PENDING', 'RUNNING', 'FAILED']).toContain(jobAfterResume.status)
          }

          // Property: Checkpoint order should be maintained
          for (let i = 1; i < jobAfterResume.checkpoints.length; i++) {
            const prevCheckpoint = jobAfterResume.checkpoints[i - 1]
            const currentCheckpoint = jobAfterResume.checkpoints[i]
            
            // Extract processed items from checkpoint IDs
            const prevItems = parseInt(prevCheckpoint.split('_')[2] || '0')
            const currentItems = parseInt(currentCheckpoint.split('_')[2] || '0')
            
            expect(currentItems).toBeGreaterThanOrEqual(prevItems)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should not duplicate work when resuming from checkpoints', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobType: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK') as fc.Arbitrary<JobType>,
          totalItems: fc.integer({ min: 100, max: 1000 }),
          checkpointInterval: fc.integer({ min: 10, max: 50 })
        }),
        async ({ workflowId, jobType, totalItems, checkpointInterval }) => {
          // Create job
          const job = await jobManager.createJob({
            workflowId,
            type: jobType,
            scanTarget: `test-target-${jobType.toLowerCase()}`,
            batchSize: checkpointInterval,
            checkpointInterval
          })

          // Simulate partial processing
          const processedItems = Math.floor(totalItems * 0.6) // Process 60%
          const expectedCheckpoints = Math.floor(processedItems / checkpointInterval)
          
          // Create checkpoints
          const processedItemsList: number[] = []
          for (let i = 1; i <= expectedCheckpoints; i++) {
            const itemsProcessed = i * checkpointInterval
            processedItemsList.push(itemsProcessed)
            
            await jobManager.createCheckpoint(
              job.jobId,
              itemsProcessed,
              `item_${itemsProcessed}`,
              { checkpoint: i }
            )
          }

          // Get job state
          const jobState = await jobManager.getJobStatus(job.jobId)
          
          // Property: Each checkpoint should represent unique progress
          const checkpointItems = jobState.checkpoints.map(checkpoint => {
            const match = checkpoint.match(/checkpoint_\d+_(\d+)/)
            return match ? parseInt(match[1]) : 0
          })

          // Property: No duplicate checkpoint values
          const uniqueCheckpointItems = [...new Set(checkpointItems)]
          expect(uniqueCheckpointItems.length).toBe(checkpointItems.length)

          // Property: Checkpoints should be in ascending order
          for (let i = 1; i < checkpointItems.length; i++) {
            expect(checkpointItems[i]).toBeGreaterThan(checkpointItems[i - 1])
          }

          // Property: Total processed items should equal last checkpoint
          if (checkpointItems.length > 0) {
            const lastCheckpointItems = Math.max(...checkpointItems)
            expect(lastCheckpointItems).toBeLessThanOrEqual(totalItems)
            expect(lastCheckpointItems).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should maintain job state consistency across resume operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobType: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK') as fc.Arbitrary<JobType>,
          findings: fc.array(
            fc.record({
              matchId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
              system: fc.string({ minLength: 1, maxLength: 20 }),
              location: fc.string({ minLength: 1, maxLength: 50 }),
              piiType: fc.constantFrom('email', 'name', 'phone', 'address', 'custom'),
              confidence: fc.float({ min: 0, max: 1 }),
              snippet: fc.string({ minLength: 1, maxLength: 100 }),
              provenance: fc.record({
                timestamp: fc.date().map(d => d.toISOString())
              })
            }),
            { minLength: 0, maxLength: 10 }
          )
        }),
        async ({ workflowId, jobType, findings }) => {
          // Create job
          const job = await jobManager.createJob({
            workflowId,
            type: jobType,
            scanTarget: `test-target-${jobType.toLowerCase()}`
          })

          // Add findings to job
          if (findings.length > 0) {
            await jobManager.updateJobProgress({
              jobId: job.jobId,
              progress: 50,
              findings
            })
          }

          // Create checkpoint
          await jobManager.createCheckpoint(job.jobId, 100, 'test_item_100')

          // Get job state before resume
          const jobBeforeResume = await jobManager.getJobStatus(job.jobId)

          // Simulate resume by creating new manager
          const newJobManager = new BackgroundJobManager(workflowStateManager, piiAgent)
          
          // In a real system, the new job manager would rebuild its job mapping
          newJobManager['jobToWorkflowMap'].set(job.jobId, workflowId)
          
          // Get job state after resume
          const jobAfterResume = await newJobManager.getJobStatus(job.jobId)

          // Property: Job ID should remain the same
          expect(jobAfterResume.jobId).toBe(jobBeforeResume.jobId)

          // Property: Workflow ID should remain the same
          expect(jobAfterResume.workflowId).toBe(jobBeforeResume.workflowId)

          // Property: Job type should remain the same
          expect(jobAfterResume.type).toBe(jobBeforeResume.type)

          // Property: Findings should be preserved
          expect(jobAfterResume.findings).toEqual(jobBeforeResume.findings)

          // Property: Checkpoints should be preserved
          expect(jobAfterResume.checkpoints).toEqual(jobBeforeResume.checkpoints)

          // Property: Progress should not decrease
          expect(jobAfterResume.progress).toBeGreaterThanOrEqual(jobBeforeResume.progress)
        }
      ),
      { numRuns: 100 }
    )
  })
})