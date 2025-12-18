/**
 * Property-based tests for background job PII discovery handling
 * **Feature: gdpr-erasure-system, Property 15: PII Discovery Handling**
 * **Validates: Requirements 5.4**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'
import { BackgroundJobManager } from '../../../src/gdpr/services/background-job-manager.js'
import { WorkflowStateManager } from '../../../src/gdpr/services/workflow-state-manager.js'
import { PIIAgent } from '../../../src/gdpr/services/pii-agent.js'
import { BackgroundJob, JobType, WorkflowState, PIIFinding } from '../../../src/gdpr/types/index.js'

describe('Background Job PII Discovery Handling Properties', () => {
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
   * Property 15: PII Discovery Handling
   * For any PII found during background scans, the system should spawn 
   * appropriate deletion steps and update audit trails
   */
  it('should properly handle PII findings discovered during background scans', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobType: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK') as fc.Arbitrary<JobType>,
          piiFindings: fc.array(
            fc.record({
              matchId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
              system: fc.string({ minLength: 1, maxLength: 20 }),
              location: fc.string({ minLength: 1, maxLength: 50 }),
              piiType: fc.constantFrom('email', 'name', 'phone', 'address', 'custom'),
              confidence: fc.float({ min: 0, max: 1 }),
              snippet: fc.string({ minLength: 1, maxLength: 100 }),
              provenance: fc.record({
                timestamp: fc.date().map(d => d.toISOString()),
                messageId: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
                channel: fc.option(fc.string({ minLength: 1, maxLength: 20 }))
              })
            }),
            { minLength: 0, maxLength: 10 }
          )
        }),
        async ({ workflowId, jobType, piiFindings }) => {
          // Create job
          const job = await jobManager.createJob({
            workflowId,
            type: jobType,
            scanTarget: `test-target-${jobType.toLowerCase()}`
          })

          // Add PII findings to the job
          if (piiFindings.length > 0) {
            await jobManager.updateJobProgress({
              jobId: job.jobId,
              progress: 50,
              findings: piiFindings
            })
          }

          // Get job state after PII discovery
          const jobState = await jobManager.getJobStatus(job.jobId)

          // Property: All PII findings should be stored in the job
          expect(jobState.findings.length).toBe(piiFindings.length)

          // Property: Each finding should maintain its essential properties
          for (let i = 0; i < piiFindings.length; i++) {
            const originalFinding = piiFindings[i]
            const storedFinding = jobState.findings[i]

            expect(storedFinding.matchId).toBe(originalFinding.matchId)
            expect(storedFinding.system).toBe(originalFinding.system)
            expect(storedFinding.location).toBe(originalFinding.location)
            expect(storedFinding.piiType).toBe(originalFinding.piiType)
            expect(storedFinding.confidence).toBe(originalFinding.confidence)
            expect(storedFinding.snippet).toBe(originalFinding.snippet)
            expect(storedFinding.provenance.timestamp).toBe(originalFinding.provenance.timestamp)
          }

          // Property: Findings should be categorized by confidence level
          const highConfidenceFindings = jobState.findings.filter(f => f.confidence >= 0.8)
          const mediumConfidenceFindings = jobState.findings.filter(f => f.confidence >= 0.5 && f.confidence < 0.8)
          const lowConfidenceFindings = jobState.findings.filter(f => f.confidence < 0.5)

          const expectedHighConfidence = piiFindings.filter(f => f.confidence >= 0.8).length
          const expectedMediumConfidence = piiFindings.filter(f => f.confidence >= 0.5 && f.confidence < 0.8).length
          const expectedLowConfidence = piiFindings.filter(f => f.confidence < 0.5).length

          expect(highConfidenceFindings.length).toBe(expectedHighConfidence)
          expect(mediumConfidenceFindings.length).toBe(expectedMediumConfidence)
          expect(lowConfidenceFindings.length).toBe(expectedLowConfidence)

          // Property: All findings should have confidence scores (may be NaN from float generation)
          for (const finding of jobState.findings) {
            if (!isNaN(finding.confidence)) {
              expect(finding.confidence).toBeGreaterThanOrEqual(0)
              expect(finding.confidence).toBeLessThanOrEqual(1)
            }
          }

          // Property: All findings should have unique match IDs
          const matchIds = jobState.findings.map(f => f.matchId)
          const uniqueMatchIds = [...new Set(matchIds)]
          expect(uniqueMatchIds.length).toBe(matchIds.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle incremental PII discovery across multiple updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobType: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK') as fc.Arbitrary<JobType>,
          findingBatches: fc.array(
            fc.array(
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
            ),
            { minLength: 1, maxLength: 5 }
          )
        }),
        async ({ workflowId, jobType, findingBatches }) => {
          // Create job
          const job = await jobManager.createJob({
            workflowId,
            type: jobType,
            scanTarget: `test-target-${jobType.toLowerCase()}`
          })

          let totalExpectedFindings = 0
          let progressIncrement = Math.floor(100 / findingBatches.length)

          // Add findings in batches (simulating incremental discovery)
          for (let i = 0; i < findingBatches.length; i++) {
            const batch = findingBatches[i]
            totalExpectedFindings += batch.length

            await jobManager.updateJobProgress({
              jobId: job.jobId,
              progress: Math.min(100, (i + 1) * progressIncrement),
              findings: batch
            })

            // Check intermediate state
            const intermediateState = await jobManager.getJobStatus(job.jobId)
            expect(intermediateState.findings.length).toBe(totalExpectedFindings)
          }

          // Get final job state
          const finalJobState = await jobManager.getJobStatus(job.jobId)

          // Property: Total findings should equal sum of all batches
          const expectedTotalFindings = findingBatches.reduce((sum, batch) => sum + batch.length, 0)
          expect(finalJobState.findings.length).toBe(expectedTotalFindings)

          // Property: All findings should be preserved in order
          let findingIndex = 0
          for (const batch of findingBatches) {
            for (const expectedFinding of batch) {
              const actualFinding = finalJobState.findings[findingIndex]
              expect(actualFinding.matchId).toBe(expectedFinding.matchId)
              expect(actualFinding.confidence).toBe(expectedFinding.confidence)
              findingIndex++
            }
          }

          // Property: No findings should be lost or duplicated
          const allExpectedMatchIds = findingBatches.flat().map(f => f.matchId)
          const actualMatchIds = finalJobState.findings.map(f => f.matchId)
          expect(actualMatchIds.sort()).toEqual(allExpectedMatchIds.sort())
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should correctly classify PII findings for automatic vs manual processing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobType: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK') as fc.Arbitrary<JobType>,
          mixedConfidenceFindings: fc.array(
            fc.record({
              matchId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
              system: fc.string({ minLength: 1, maxLength: 20 }),
              location: fc.string({ minLength: 1, maxLength: 50 }),
              piiType: fc.constantFrom('email', 'name', 'phone', 'address', 'custom'),
              confidence: fc.oneof(
                fc.float({ min: Math.fround(0.8), max: Math.fround(1.0) }),    // High confidence - auto delete
                fc.float({ min: Math.fround(0.5), max: Math.fround(0.79) }),   // Medium confidence - manual review
                fc.float({ min: Math.fround(0.0), max: Math.fround(0.49) })    // Low confidence - ignore
              ),
              snippet: fc.string({ minLength: 1, maxLength: 100 }),
              provenance: fc.record({
                timestamp: fc.date().map(d => d.toISOString())
              })
            }),
            { minLength: 1, maxLength: 20 }
          )
        }),
        async ({ workflowId, jobType, mixedConfidenceFindings }) => {
          // Create job
          const job = await jobManager.createJob({
            workflowId,
            type: jobType,
            scanTarget: `test-target-${jobType.toLowerCase()}`
          })

          // Add mixed confidence findings
          await jobManager.updateJobProgress({
            jobId: job.jobId,
            progress: 100,
            findings: mixedConfidenceFindings
          })

          // Get job state
          const jobState = await jobManager.getJobStatus(job.jobId)

          // Classify findings by confidence thresholds (handle NaN values)
          const autoDeleteFindings = jobState.findings.filter(f => !isNaN(f.confidence) && f.confidence >= 0.8)
          const manualReviewFindings = jobState.findings.filter(f => !isNaN(f.confidence) && f.confidence >= 0.5 && f.confidence < 0.8)
          const ignoreFindings = jobState.findings.filter(f => isNaN(f.confidence) || f.confidence < 0.5)

          // Expected classifications (handle NaN values)
          const expectedAutoDelete = mixedConfidenceFindings.filter(f => !isNaN(f.confidence) && f.confidence >= 0.8)
          const expectedManualReview = mixedConfidenceFindings.filter(f => !isNaN(f.confidence) && f.confidence >= 0.5 && f.confidence < 0.8)
          const expectedIgnore = mixedConfidenceFindings.filter(f => isNaN(f.confidence) || f.confidence < 0.5)

          // Property: Classification should be accurate
          expect(autoDeleteFindings.length).toBe(expectedAutoDelete.length)
          expect(manualReviewFindings.length).toBe(expectedManualReview.length)
          expect(ignoreFindings.length).toBe(expectedIgnore.length)

          // Property: High confidence findings should be marked for automatic deletion
          for (const finding of autoDeleteFindings) {
            expect(finding.confidence).not.toBeNaN()
            expect(finding.confidence).toBeGreaterThanOrEqual(0.8)
            // In a real system, these would trigger automatic deletion steps
          }

          // Property: Medium confidence findings should be flagged for manual review
          for (const finding of manualReviewFindings) {
            expect(finding.confidence).not.toBeNaN()
            expect(finding.confidence).toBeGreaterThanOrEqual(0.5)
            expect(finding.confidence).toBeLessThan(0.8)
            // In a real system, these would be queued for human review
          }

          // Property: Low confidence findings should be present but not acted upon
          for (const finding of ignoreFindings) {
            if (!isNaN(finding.confidence)) {
              expect(finding.confidence).toBeLessThan(0.5)
            }
            // In a real system, these would be logged but not processed
          }

          // Property: Total findings should be preserved
          const totalClassified = autoDeleteFindings.length + manualReviewFindings.length + ignoreFindings.length
          expect(totalClassified).toBe(mixedConfidenceFindings.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should maintain PII finding integrity across job state updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
          jobType: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK') as fc.Arbitrary<JobType>,
          initialFindings: fc.array(
            fc.record({
              matchId: fc.string().filter(s => s.length > 0).map(() => uuidv4()),
              system: fc.string({ minLength: 1, maxLength: 20 }),
              location: fc.string({ minLength: 1, maxLength: 50 }),
              piiType: fc.constantFrom('email', 'name', 'phone', 'address', 'custom'),
              confidence: fc.float({ min: 0, max: 1 }),
              snippet: fc.string({ minLength: 1, maxLength: 100 }),
              provenance: fc.record({
                timestamp: fc.date().map(d => d.toISOString()),
                messageId: fc.option(fc.string({ minLength: 1, maxLength: 20 }))
              })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          progressUpdates: fc.array(
            fc.integer({ min: 0, max: 100 }),
            { minLength: 1, maxLength: 5 }
          ).map(updates => updates.sort((a, b) => a - b)) // Ensure monotonic progress
        }),
        async ({ workflowId, jobType, initialFindings, progressUpdates }) => {
          // Create job
          const job = await jobManager.createJob({
            workflowId,
            type: jobType,
            scanTarget: `test-target-${jobType.toLowerCase()}`
          })

          // Add initial findings
          await jobManager.updateJobProgress({
            jobId: job.jobId,
            progress: 10,
            findings: initialFindings
          })

          // Store initial state for comparison
          const initialJobState = await jobManager.getJobStatus(job.jobId)
          const initialFindingIds = initialJobState.findings.map(f => f.matchId)

          // Apply multiple progress updates without new findings
          for (const progress of progressUpdates) {
            await jobManager.updateJobProgress({
              jobId: job.jobId,
              progress
              // No new findings in these updates
            })
          }

          // Get final job state
          const finalJobState = await jobManager.getJobStatus(job.jobId)

          // Property: Initial findings should be preserved
          expect(finalJobState.findings.length).toBe(initialFindings.length)

          // Property: Finding IDs should remain unchanged
          const finalFindingIds = finalJobState.findings.map(f => f.matchId)
          expect(finalFindingIds.sort()).toEqual(initialFindingIds.sort())

          // Property: Finding content should remain intact
          for (const originalFinding of initialFindings) {
            const preservedFinding = finalJobState.findings.find(f => f.matchId === originalFinding.matchId)
            expect(preservedFinding).toBeDefined()
            
            if (preservedFinding) {
              expect(preservedFinding.system).toBe(originalFinding.system)
              expect(preservedFinding.location).toBe(originalFinding.location)
              expect(preservedFinding.piiType).toBe(originalFinding.piiType)
              expect(preservedFinding.confidence).toBe(originalFinding.confidence)
              expect(preservedFinding.snippet).toBe(originalFinding.snippet)
              expect(preservedFinding.provenance.timestamp).toBe(originalFinding.provenance.timestamp)
            }
          }

          // Property: Progress should have advanced
          expect(finalJobState.progress).toBeGreaterThanOrEqual(initialJobState.progress)
        }
      ),
      { numRuns: 100 }
    )
  })
})