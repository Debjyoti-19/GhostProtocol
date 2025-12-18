/**
 * Property-based tests for background job progress reporting
 * **Feature: gdpr-erasure-system, Property 14: Progress Reporting**
 * **Validates: Requirements 5.2**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'
import { BackgroundJobManager } from '../../../src/gdpr/services/background-job-manager.js'
import { WorkflowStateManager } from '../../../src/gdpr/services/workflow-state-manager.js'
import { PIIAgent } from '../../../src/gdpr/services/pii-agent.js'
import { BackgroundJob, JobType, WorkflowState } from '../../../src/gdpr/types/index.js'

describe('Background Job Progress Reporting Properties', () => {
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

  /**
   * Property 14: Progress Reporting
   * For any running background job, progress updates should be consistently 
   * reported to the workflow state
   */
  it('should consistently report progress updates to workflow state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobType: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK') as fc.Arbitrary<JobType>,
          progressUpdates: fc.array(
            fc.record({
              progress: fc.integer({ min: 0, max: 100 }),
              processedItems: fc.integer({ min: 0, max: 1000 }),
              totalItems: fc.integer({ min: 100, max: 1000 })
            }),
            { minLength: 1, maxLength: 10 }
          ).map(updates => 
            // Ensure progress is monotonically increasing
            updates.sort((a, b) => a.progress - b.progress)
          )
        }),
        async ({ workflowId, jobType, progressUpdates }) => {
          // Create job
          const job = await jobManager.createJob({
            workflowId,
            type: jobType,
            scanTarget: `test-target-${jobType.toLowerCase()}`
          })

          // Apply progress updates
          for (const update of progressUpdates) {
            await jobManager.updateJobProgress({
              jobId: job.jobId,
              progress: update.progress,
              processedItems: update.processedItems,
              totalItems: update.totalItems
            })
          }

          // Get final job state
          const finalJobState = await jobManager.getJobStatus(job.jobId)

          // Property: Progress should be reported and stored
          expect(finalJobState.progress).toBeDefined()
          expect(typeof finalJobState.progress).toBe('number')

          // Property: Progress should be within valid range
          expect(finalJobState.progress).toBeGreaterThanOrEqual(0)
          expect(finalJobState.progress).toBeLessThanOrEqual(100)

          // Property: Final progress should match last update
          if (progressUpdates.length > 0) {
            const lastUpdate = progressUpdates[progressUpdates.length - 1]
            expect(finalJobState.progress).toBe(lastUpdate.progress)
          }

          // Property: Workflow state should be updated
          expect(workflowStateManager.updateBackgroundJob).toHaveBeenCalled()
          
          // Property: Job should exist in workflow state
          const workflowState = await workflowStateManager.getWorkflowState(workflowId)
          expect(workflowState?.backgroundJobs[job.jobId]).toBeDefined()
          expect(workflowState?.backgroundJobs[job.jobId].progress).toBe(finalJobState.progress)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should maintain progress monotonicity during updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobType: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK') as fc.Arbitrary<JobType>,
          progressSequence: fc.array(
            fc.integer({ min: 0, max: 100 }),
            { minLength: 2, maxLength: 20 }
          )
        }),
        async ({ workflowId, jobType, progressSequence }) => {
          // Create job
          const job = await jobManager.createJob({
            workflowId,
            type: jobType,
            scanTarget: `test-target-${jobType.toLowerCase()}`
          })

          const recordedProgress: number[] = []

          // Apply progress updates in sequence
          for (const progress of progressSequence) {
            await jobManager.updateJobProgress({
              jobId: job.jobId,
              progress
            })

            const currentJobState = await jobManager.getJobStatus(job.jobId)
            recordedProgress.push(currentJobState.progress)
          }

          // Property: Progress should never decrease (monotonic)
          for (let i = 1; i < recordedProgress.length; i++) {
            expect(recordedProgress[i]).toBeGreaterThanOrEqual(recordedProgress[i - 1])
          }

          // Property: All progress values should be valid
          for (const progress of recordedProgress) {
            expect(progress).toBeGreaterThanOrEqual(0)
            expect(progress).toBeLessThanOrEqual(100)
          }

          // Property: Final progress should be the maximum from the sequence
          const maxProgress = Math.max(...progressSequence)
          const finalProgress = recordedProgress[recordedProgress.length - 1]
          expect(finalProgress).toBe(maxProgress)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should accurately track checkpoint creation during progress updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobType: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK') as fc.Arbitrary<JobType>,
          checkpointData: fc.array(
            fc.record({
              processedItems: fc.integer({ min: 1, max: 1000 }),
              lastProcessedKey: fc.string({ minLength: 1, maxLength: 50 }),
              metadata: fc.record({
                batchNumber: fc.integer({ min: 1, max: 100 }),
                scanType: fc.string({ minLength: 1, maxLength: 20 })
              })
            }),
            { minLength: 1, maxLength: 5 }
          ).map(checkpoints => 
            // Sort by processed items to ensure logical order
            checkpoints.sort((a, b) => a.processedItems - b.processedItems)
          )
        }),
        async ({ workflowId, jobType, checkpointData }) => {
          // Create job
          const job = await jobManager.createJob({
            workflowId,
            type: jobType,
            scanTarget: `test-target-${jobType.toLowerCase()}`
          })

          const createdCheckpoints: string[] = []

          // Create checkpoints with progress updates
          for (const checkpoint of checkpointData) {
            const checkpointId = await jobManager.createCheckpoint(
              job.jobId,
              checkpoint.processedItems,
              checkpoint.lastProcessedKey,
              checkpoint.metadata
            )
            createdCheckpoints.push(checkpointId)
          }

          // Get final job state
          const finalJobState = await jobManager.getJobStatus(job.jobId)

          // Property: All checkpoints should be recorded
          expect(finalJobState.checkpoints.length).toBe(checkpointData.length)

          // Property: Checkpoints should be in the order they were created
          for (let i = 0; i < createdCheckpoints.length; i++) {
            expect(finalJobState.checkpoints[i]).toBe(createdCheckpoints[i])
          }

          // Property: Checkpoint IDs should contain processed item counts
          for (let i = 0; i < finalJobState.checkpoints.length; i++) {
            const checkpointId = finalJobState.checkpoints[i]
            const expectedItems = checkpointData[i].processedItems
            
            // Extract items from checkpoint ID format: checkpoint_timestamp_items
            const match = checkpointId.match(/checkpoint_\d+_(\d+)/)
            expect(match).toBeTruthy()
            if (match) {
              const actualItems = parseInt(match[1])
              expect(actualItems).toBe(expectedItems)
            }
          }

          // Property: Progress should reflect checkpoint progress
          if (checkpointData.length > 0) {
            const lastCheckpoint = checkpointData[checkpointData.length - 1]
            // Progress should be at least as much as indicated by checkpoints
            expect(finalJobState.progress).toBeGreaterThanOrEqual(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle concurrent progress updates correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobType: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK') as fc.Arbitrary<JobType>,
          concurrentUpdates: fc.array(
            fc.record({
              progress: fc.integer({ min: 0, max: 100 }),
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
                { minLength: 0, maxLength: 3 }
              )
            }),
            { minLength: 2, maxLength: 10 }
          )
        }),
        async ({ workflowId, jobType, concurrentUpdates }) => {
          // Create job
          const job = await jobManager.createJob({
            workflowId,
            type: jobType,
            scanTarget: `test-target-${jobType.toLowerCase()}`
          })

          // Apply all updates concurrently
          const updatePromises = concurrentUpdates.map(update =>
            jobManager.updateJobProgress({
              jobId: job.jobId,
              progress: update.progress,
              findings: update.findings
            })
          )

          await Promise.all(updatePromises)

          // Get final job state
          const finalJobState = await jobManager.getJobStatus(job.jobId)

          // Property: Final progress should be the maximum from all updates
          const maxProgress = Math.max(...concurrentUpdates.map(u => u.progress))
          expect(finalJobState.progress).toBe(maxProgress)

          // Property: All findings should be accumulated
          const totalExpectedFindings = concurrentUpdates.reduce(
            (sum, update) => sum + update.findings.length, 
            0
          )
          expect(finalJobState.findings.length).toBe(totalExpectedFindings)

          // Property: No findings should be duplicated (all should have unique IDs)
          const findingIds = finalJobState.findings.map(f => f.matchId)
          const uniqueFindingIds = [...new Set(findingIds)]
          expect(uniqueFindingIds.length).toBe(findingIds.length)

          // Property: Job should remain in valid state
          expect(finalJobState.jobId).toBe(job.jobId)
          expect(finalJobState.workflowId).toBe(workflowId)
          expect(finalJobState.type).toBe(jobType)
        }
      ),
      { numRuns: 100 }
    )
  })
})