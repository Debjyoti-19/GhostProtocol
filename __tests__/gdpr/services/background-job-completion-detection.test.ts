/**
 * Property-based tests for background job completion detection
 * **Feature: gdpr-erasure-system, Property 16: Completion Detection**
 * **Validates: Requirements 5.5**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'
import { BackgroundJobManager } from '../../../src/gdpr/services/background-job-manager.js'
import { WorkflowStateManager } from '../../../src/gdpr/services/workflow-state-manager.js'
import { PIIAgent } from '../../../src/gdpr/services/pii-agent.js'
import { BackgroundJob, JobType, JobStatus, WorkflowState } from '../../../src/gdpr/types/index.js'

describe('Background Job Completion Detection Properties', () => {
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
   * Property 16: Completion Detection
   * For any set of background jobs in a workflow, the scan phase should only 
   * be marked complete when all jobs reach terminal states
   */
  it('should correctly detect completion when all jobs reach terminal states', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobConfigs: fc.array(
            fc.record({
              type: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK') as fc.Arbitrary<JobType>,
              finalStatus: fc.constantFrom('COMPLETED', 'FAILED') as fc.Arbitrary<JobStatus>
            }),
            { minLength: 1, maxLength: 5 }
          )
        }),
        async ({ workflowId, jobConfigs }) => {
          // Create multiple background jobs
          const jobs: BackgroundJob[] = []
          for (const config of jobConfigs) {
            const job = await jobManager.createJob({
              workflowId,
              type: config.type,
              scanTarget: `test-target-${config.type.toLowerCase()}`
            })
            jobs.push(job)
          }

          // Initially, jobs should not be complete
          const initialCompletion = await jobManager.areAllJobsComplete(workflowId)
          expect(initialCompletion).toBe(false) // Jobs are in PENDING state

          // Update jobs to their final states
          for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i]
            const finalStatus = jobConfigs[i].finalStatus
            
            // Update job to final status
            await jobManager.updateJobProgress({
              jobId: job.jobId,
              progress: finalStatus === 'COMPLETED' ? 100 : 50
            })

            // Manually set the status (simulating job completion)
            const workflowState = await workflowStateManager.getWorkflowState(workflowId)
            if (workflowState) {
              const updatedJob = { ...workflowState.backgroundJobs[job.jobId], status: finalStatus }
              await workflowStateManager.updateBackgroundJob(workflowId, updatedJob)
            }
          }

          // Now all jobs should be complete
          const finalCompletion = await jobManager.areAllJobsComplete(workflowId)
          expect(finalCompletion).toBe(true)

          // Property: Completion should be true only when ALL jobs are in terminal states
          const workflowState = await workflowStateManager.getWorkflowState(workflowId)
          if (workflowState) {
            const allJobs = Object.values(workflowState.backgroundJobs)
            const terminalStates: JobStatus[] = ['COMPLETED', 'FAILED']
            
            for (const job of allJobs) {
              expect(terminalStates).toContain(job.status)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should not detect completion when any job is still running', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          completedJobCount: fc.integer({ min: 0, max: 4 }),
          runningJobCount: fc.integer({ min: 1, max: 3 }),
          pendingJobCount: fc.integer({ min: 0, max: 2 })
        }),
        async ({ workflowId, completedJobCount, runningJobCount, pendingJobCount }) => {
          const totalJobs = completedJobCount + runningJobCount + pendingJobCount
          if (totalJobs === 0) return // Skip empty test cases

          const jobs: BackgroundJob[] = []
          
          // Create completed jobs
          for (let i = 0; i < completedJobCount; i++) {
            const job = await jobManager.createJob({
              workflowId,
              type: 'S3_SCAN',
              scanTarget: `completed-target-${i}`
            })
            jobs.push(job)
            
            // Set to completed
            const workflowState = await workflowStateManager.getWorkflowState(workflowId)
            if (workflowState) {
              const updatedJob = { ...workflowState.backgroundJobs[job.jobId], status: 'COMPLETED' as JobStatus, progress: 100 }
              await workflowStateManager.updateBackgroundJob(workflowId, updatedJob)
            }
          }

          // Create running jobs
          for (let i = 0; i < runningJobCount; i++) {
            const job = await jobManager.createJob({
              workflowId,
              type: 'WAREHOUSE_SCAN',
              scanTarget: `running-target-${i}`
            })
            jobs.push(job)
            
            // Set to running
            const workflowState = await workflowStateManager.getWorkflowState(workflowId)
            if (workflowState) {
              const updatedJob = { ...workflowState.backgroundJobs[job.jobId], status: 'RUNNING' as JobStatus, progress: 50 }
              await workflowStateManager.updateBackgroundJob(workflowId, updatedJob)
            }
          }

          // Create pending jobs
          for (let i = 0; i < pendingJobCount; i++) {
            const job = await jobManager.createJob({
              workflowId,
              type: 'BACKUP_CHECK',
              scanTarget: `pending-target-${i}`
            })
            jobs.push(job)
            // Jobs remain in PENDING state by default
          }

          // Check completion status
          const isComplete = await jobManager.areAllJobsComplete(workflowId)

          // Property: Should not be complete if any job is running or pending
          expect(isComplete).toBe(false)

          // Verify the state
          const workflowState = await workflowStateManager.getWorkflowState(workflowId)
          if (workflowState) {
            const allJobs = Object.values(workflowState.backgroundJobs)
            const nonTerminalJobs = allJobs.filter(job => 
              job.status !== 'COMPLETED' && job.status !== 'FAILED'
            )
            
            // Property: There should be at least one non-terminal job
            expect(nonTerminalJobs.length).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle empty job sets correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4())
        }),
        async ({ workflowId }) => {
          // Create workflow state with no background jobs
          const emptyState: WorkflowState = {
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
            backgroundJobs: {}, // Empty jobs
            auditHashes: [],
            dataLineageSnapshot: {
              systems: [],
              identifiers: [],
              capturedAt: new Date().toISOString()
            }
          }
          
          mockWorkflowStates.set(workflowId, emptyState)

          // Check completion for workflow with no jobs
          const isComplete = await jobManager.areAllJobsComplete(workflowId)

          // Property: Empty job set should be considered complete
          expect(isComplete).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should correctly aggregate findings from all completed jobs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobsWithFindings: fc.array(
            fc.record({
              type: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK') as fc.Arbitrary<JobType>,
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
                { minLength: 0, maxLength: 5 }
              )
            }),
            { minLength: 1, maxLength: 4 }
          )
        }),
        async ({ workflowId, jobsWithFindings }) => {
          const jobs: BackgroundJob[] = []
          let totalExpectedFindings = 0

          // Create jobs with findings
          for (const jobConfig of jobsWithFindings) {
            const job = await jobManager.createJob({
              workflowId,
              type: jobConfig.type,
              scanTarget: `test-target-${jobConfig.type.toLowerCase()}`
            })
            jobs.push(job)

            // Add findings to job
            if (jobConfig.findings.length > 0) {
              await jobManager.updateJobProgress({
                jobId: job.jobId,
                progress: 100,
                findings: jobConfig.findings
              })
              totalExpectedFindings += jobConfig.findings.length
            }

            // Mark job as completed
            const workflowState = await workflowStateManager.getWorkflowState(workflowId)
            if (workflowState) {
              const updatedJob = { ...workflowState.backgroundJobs[job.jobId], status: 'COMPLETED' as JobStatus }
              await workflowStateManager.updateBackgroundJob(workflowId, updatedJob)
            }
          }

          // Get all findings from completed jobs
          const allFindings = await jobManager.getAllFindings(workflowId)

          // Property: Total findings should equal sum of all job findings
          expect(allFindings.length).toBe(totalExpectedFindings)

          // Property: All findings should have unique match IDs
          const matchIds = allFindings.map(f => f.matchId)
          const uniqueMatchIds = [...new Set(matchIds)]
          expect(uniqueMatchIds.length).toBe(matchIds.length)

          // Property: Findings should come from all jobs that had findings
          const expectedMatchIds = jobsWithFindings.flatMap(job => job.findings.map(f => f.matchId))
          expect(matchIds.sort()).toEqual(expectedMatchIds.sort())

          // Property: All findings should be properly structured
          for (const finding of allFindings) {
            expect(finding.matchId).toBeDefined()
            expect(finding.system).toBeDefined()
            expect(finding.location).toBeDefined()
            expect(finding.piiType).toBeDefined()
            expect(finding.snippet).toBeDefined()
            expect(finding.provenance).toBeDefined()
            expect(finding.provenance.timestamp).toBeDefined()
            
            if (!isNaN(finding.confidence)) {
              expect(finding.confidence).toBeGreaterThanOrEqual(0)
              expect(finding.confidence).toBeLessThanOrEqual(1)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle mixed job states correctly during completion detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobStates: fc.array(
            fc.constantFrom('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') as fc.Arbitrary<JobStatus>,
            { minLength: 2, maxLength: 6 }
          )
        }),
        async ({ workflowId, jobStates }) => {
          const jobs: BackgroundJob[] = []

          // Create jobs with specified states
          for (let i = 0; i < jobStates.length; i++) {
            const job = await jobManager.createJob({
              workflowId,
              type: 'S3_SCAN',
              scanTarget: `test-target-${i}`
            })
            jobs.push(job)

            // Set job to specified state
            const targetStatus = jobStates[i]
            const progress = targetStatus === 'COMPLETED' ? 100 : 
                           targetStatus === 'FAILED' ? 75 :
                           targetStatus === 'RUNNING' ? 50 : 0

            await jobManager.updateJobProgress({
              jobId: job.jobId,
              progress
            })

            // Update status
            const workflowState = await workflowStateManager.getWorkflowState(workflowId)
            if (workflowState) {
              const updatedJob = { ...workflowState.backgroundJobs[job.jobId], status: targetStatus }
              await workflowStateManager.updateBackgroundJob(workflowId, updatedJob)
            }
          }

          // Check completion
          const isComplete = await jobManager.areAllJobsComplete(workflowId)

          // Property: Should be complete only if all jobs are COMPLETED or FAILED
          const terminalStates = ['COMPLETED', 'FAILED']
          const allTerminal = jobStates.every(state => terminalStates.includes(state))
          expect(isComplete).toBe(allTerminal)

          // Verify actual job states match expected
          const workflowState = await workflowStateManager.getWorkflowState(workflowId)
          if (workflowState) {
            const actualStates = Object.values(workflowState.backgroundJobs).map(job => job.status)
            expect(actualStates.sort()).toEqual(jobStates.sort())
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})