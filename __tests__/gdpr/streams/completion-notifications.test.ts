/**
 * Property-Based Tests for Completion Notifications
 * 
 * **Feature: gdpr-erasure-system, Property 21: Completion Notifications**
 * **Validates: Requirements 7.5**
 * 
 * Tests that completed workflows notify compliance teams through configured channels.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'
import { MonitoringStreamManager, StreamContext } from '../../../src/gdpr/services/monitoring-stream-manager.js'
import { CompletionNotification } from '../../../src/streams/index.js'
import { 
  WorkflowState, 
  WorkflowStatus, 
  StepStatus, 
  CertificateOfDestruction,
  UserIdentifiers,
  DataLineageSnapshot,
  BackgroundJob,
  LegalHold
} from '../../../src/gdpr/types/index.js'

// Mock stream implementation for testing
class MockStream {
  private data: Map<string, Map<string, any>> = new Map()
  private events: Array<{ channel: any, event: any }> = []

  async set(groupId: string, id: string, data: any): Promise<any> {
    if (!this.data.has(groupId)) {
      this.data.set(groupId, new Map())
    }
    this.data.get(groupId)!.set(id, data)
    return data
  }

  async get(groupId: string, id: string): Promise<any | null> {
    return this.data.get(groupId)?.get(id) || null
  }

  async getGroup(groupId: string): Promise<any[]> {
    const group = this.data.get(groupId)
    return group ? Array.from(group.values()) : []
  }

  async send(channel: any, event: any): Promise<void> {
    this.events.push({ channel, event })
  }

  getEvents(): Array<{ channel: any, event: any }> {
    return [...this.events]
  }

  clear(): void {
    this.data.clear()
    this.events.length = 0
  }

  clearEvents(): void {
    this.events.length = 0
  }
}

// Mock logger
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
}

describe('Completion Notifications Property Tests', () => {
  let mockWorkflowStatusStream: MockStream
  let mockErrorStream: MockStream
  let mockCompletionStream: MockStream
  let streamManager: MonitoringStreamManager

  beforeEach(() => {
    mockWorkflowStatusStream = new MockStream()
    mockErrorStream = new MockStream()
    mockCompletionStream = new MockStream()

    const streamContext: StreamContext = {
      workflowStatus: mockWorkflowStatusStream,
      errorNotifications: mockErrorStream,
      completionNotifications: mockCompletionStream
    }

    streamManager = new MonitoringStreamManager(streamContext, mockLogger)
  })

  afterEach(() => {
    mockWorkflowStatusStream.clear()
    mockErrorStream.clear()
    mockCompletionStream.clear()
  })

  /**
   * Property 21: Completion Notifications
   * For any completed workflow, the system should notify compliance teams 
   * through configured channels
   */
  it('should notify compliance teams for all completed workflows', async () => {
    await fc.assert(fc.asyncProperty(
      // Generate random workflow completion data
      fc.uuid(), // workflowId
      fc.constantFrom('COMPLETED', 'COMPLETED_WITH_EXCEPTIONS'), // status
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 20 }),
        emails: fc.array(fc.emailAddress(), { minLength: 1, maxLength: 5 }),
        phones: fc.array(fc.string({ minLength: 10, maxLength: 15 }), { minLength: 0, maxLength: 3 }),
        aliases: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 })
      }), // userIdentifiers
      fc.array(fc.record({
        stepName: fc.string({ minLength: 1, maxLength: 30 }).filter(s => 
          s !== '__proto__' && s !== 'constructor' && s !== 'prototype' && s.trim().length > 0
        ),
        status: fc.constantFrom('DELETED', 'FAILED', 'LEGAL_HOLD'),
        attempts: fc.integer({ min: 1, max: 5 }),
        evidence: fc.record({
          timestamp: fc.date().map(d => d.toISOString()),
          receipt: fc.option(fc.string({ minLength: 1, maxLength: 100 }))
        })
      }), { minLength: 1, maxLength: 10 }), // steps
      fc.array(fc.record({
        jobId: fc.uuid(),
        type: fc.constantFrom('S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK'),
        status: fc.constantFrom('COMPLETED', 'FAILED'),
        progress: fc.integer({ min: 0, max: 100 }),
        findings: fc.array(fc.record({
          matchId: fc.uuid(),
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
        }), { minLength: 0, maxLength: 5 })
      }), { minLength: 0, maxLength: 5 }), // backgroundJobs
      fc.array(fc.record({
        system: fc.string({ minLength: 1, maxLength: 20 }),
        reason: fc.string({ minLength: 1, maxLength: 100 }),
        expiresAt: fc.option(fc.date().map(d => d.toISOString()))
      }), { minLength: 0, maxLength: 3 }), // legalHolds
      fc.option(fc.record({
        certificateId: fc.uuid(),
        auditHashRoot: fc.hexaString({ minLength: 64, maxLength: 64 }),
        signature: fc.string({ minLength: 1, maxLength: 200 })
      })), // certificate
      fc.option(fc.date().map(d => d.toISOString())), // startedAt
      async (workflowId, status, userIdentifiers, stepSpecs, jobSpecs, legalHolds, certificate, startedAt) => {
        // Clear previous events
        mockCompletionStream.clear()

        // Create workflow state
        const steps: Record<string, any> = {}
        stepSpecs.forEach((spec, index) => {
          // Filter out problematic property names
          const stepName = spec.stepName === '__proto__' || spec.stepName === 'constructor' || spec.stepName === 'prototype' 
            ? `step-${index}` 
            : spec.stepName
          steps[stepName] = {
            status: spec.status,
            attempts: spec.attempts,
            evidence: spec.evidence
          }
        })

        const backgroundJobs: Record<string, BackgroundJob> = {}
        jobSpecs.forEach(spec => {
          backgroundJobs[spec.jobId] = {
            jobId: spec.jobId,
            type: spec.type as any,
            workflowId,
            status: spec.status as any,
            progress: spec.progress,
            checkpoints: [],
            findings: spec.findings as any
          }
        })

        const dataLineageSnapshot: DataLineageSnapshot = {
          systems: ['stripe', 'database', 'intercom'],
          identifiers: [userIdentifiers.userId, ...userIdentifiers.emails],
          capturedAt: new Date().toISOString()
        }

        const workflowState: WorkflowState = {
          workflowId,
          userIdentifiers: userIdentifiers as UserIdentifiers,
          status: status as WorkflowStatus,
          policyVersion: '1.0.0',
          legalHolds: legalHolds as LegalHold[],
          steps,
          backgroundJobs,
          auditHashes: ['genesis', 'hash1', 'hash2'],
          dataLineageSnapshot
        }

        const certificateData = certificate ? {
          certificateId: certificate.certificateId,
          workflowId,
          userIdentifiers: userIdentifiers as UserIdentifiers,
          completedAt: new Date().toISOString(),
          status: status as any,
          systemReceipts: [],
          legalHolds: [],
          policyVersion: '1.0.0',
          dataLineageSnapshot,
          auditHashRoot: certificate.auditHashRoot,
          signature: certificate.signature
        } as CertificateOfDestruction : undefined

        // Publish completion notification
        await streamManager.publishCompletionNotification(
          workflowState,
          certificateData,
          startedAt
        )

        // Verify notification was stored in stream
        const storedNotifications = await mockCompletionStream.getGroup(workflowId)
        expect(storedNotifications).toHaveLength(1)

        const storedNotification = storedNotifications[0] as CompletionNotification
        expect(storedNotification.workflowId).toBe(workflowId)
        expect(storedNotification.type).toBe('WORKFLOW_COMPLETED')
        expect(storedNotification.status).toBe(status)

        // Verify summary statistics are calculated correctly
        const deletedSteps = stepSpecs.filter(s => s.status === 'DELETED').length
        const failedSteps = stepSpecs.filter(s => s.status === 'FAILED').length
        const legalHoldSteps = stepSpecs.filter(s => s.status === 'LEGAL_HOLD').length

        expect(storedNotification.summary.systems.total).toBe(stepSpecs.length)
        expect(storedNotification.summary.systems.deleted).toBe(deletedSteps)
        expect(storedNotification.summary.systems.failed).toBe(failedSteps)
        expect(storedNotification.summary.systems.legalHolds).toBe(legalHolds.length)

        const completedJobs = jobSpecs.filter(j => j.status === 'COMPLETED').length
        const failedJobs = jobSpecs.filter(j => j.status === 'FAILED').length
        const totalFindings = jobSpecs.reduce((sum, job) => sum + job.findings.length, 0)

        expect(storedNotification.summary.backgroundJobs.total).toBe(jobSpecs.length)
        expect(storedNotification.summary.backgroundJobs.completed).toBe(completedJobs)
        expect(storedNotification.summary.backgroundJobs.failed).toBe(failedJobs)
        expect(storedNotification.summary.backgroundJobs.piiFindings).toBe(totalFindings)

        // Verify user identifiers summary
        expect(storedNotification.summary.userIdentifiers.userId).toBe(userIdentifiers.userId)
        expect(storedNotification.summary.userIdentifiers.emailCount).toBe(userIdentifiers.emails.length)
        expect(storedNotification.summary.userIdentifiers.phoneCount).toBe(userIdentifiers.phones.length)
        expect(storedNotification.summary.userIdentifiers.aliasCount).toBe(userIdentifiers.aliases.length)

        // Verify certificate information if provided
        if (certificate) {
          expect(storedNotification.certificate).toBeDefined()
          expect(storedNotification.certificate!.certificateId).toBe(certificate.certificateId)
          expect(storedNotification.certificate!.auditHashRoot).toBe(certificate.auditHashRoot)
          expect(storedNotification.certificate!.signature).toBe(certificate.signature)
        }

        // Verify legal holds are included
        expect(storedNotification.legalHolds).toHaveLength(legalHolds.length)
        legalHolds.forEach((hold, index) => {
          expect(storedNotification.legalHolds![index].system).toBe(hold.system)
          expect(storedNotification.legalHolds![index].reason).toBe(hold.reason)
          expect(storedNotification.legalHolds![index].expiresAt).toBe(hold.expiresAt)
        })

        // Verify next actions are generated
        expect(storedNotification.nextActions).toBeDefined()
        expect(storedNotification.nextActions!.length).toBeGreaterThan(0)

        // Verify compliance information
        expect(storedNotification.compliance.policyVersion).toBe('1.0.0')
        expect(storedNotification.compliance.zombieCheckScheduled).toBe(true)
        expect(storedNotification.compliance.zombieCheckDate).toBeDefined()

        // Verify ephemeral events were sent (workflow-specific and global)
        const events = mockCompletionStream.getEvents()
        expect(events).toHaveLength(2)
        
        // Check workflow-specific event
        const workflowEvent = events.find(e => e.channel.groupId === workflowId)
        expect(workflowEvent).toBeDefined()
        expect(workflowEvent!.event.type).toBe('workflow_completed')
        expect(workflowEvent!.event.data).toEqual(storedNotification)

        // Check global event
        const globalEvent = events.find(e => e.channel.groupId === 'global')
        expect(globalEvent).toBeDefined()
        expect(globalEvent!.event.type).toBe('workflow_completed')
        expect(globalEvent!.event.data).toEqual(storedNotification)

        // Verify notification has valid structure
        expect(storedNotification.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        expect(new Date(storedNotification.timestamp).getTime()).toBeGreaterThan(0)
      }
    ), { numRuns: 50 })
  })

  it('should generate appropriate next actions based on workflow results', async () => {
    await fc.assert(fc.asyncProperty(
      fc.uuid(), // workflowId
      fc.integer({ min: 0, max: 5 }), // failedStepsCount
      fc.integer({ min: 0, max: 3 }), // legalHoldsCount
      async (workflowId, failedStepsCount, legalHoldsCount) => {
        // Clear previous data
        mockCompletionStream.clear()

        // Create workflow state with specific failure/hold counts
        const steps: Record<string, any> = {}
        
        // Add successful steps
        for (let i = 0; i < 3; i++) {
          steps[`success-step-${i}`] = {
            status: 'DELETED',
            attempts: 1,
            evidence: { timestamp: new Date().toISOString() }
          }
        }

        // Add failed steps
        for (let i = 0; i < failedStepsCount; i++) {
          steps[`failed-step-${i}`] = {
            status: 'FAILED',
            attempts: 3,
            evidence: { timestamp: new Date().toISOString(), receipt: 'Error occurred' }
          }
        }

        // Create legal holds
        const legalHolds: LegalHold[] = []
        for (let i = 0; i < legalHoldsCount; i++) {
          legalHolds.push({
            system: `system-${i}`,
            reason: `Legal reason ${i}`,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          })
        }

        const userIdentifiers: UserIdentifiers = {
          userId: 'test-user',
          emails: ['test@example.com'],
          phones: [],
          aliases: []
        }

        const dataLineageSnapshot: DataLineageSnapshot = {
          systems: ['stripe', 'database'],
          identifiers: ['test-user', 'test@example.com'],
          capturedAt: new Date().toISOString()
        }

        const workflowState: WorkflowState = {
          workflowId,
          userIdentifiers,
          status: failedStepsCount > 0 ? 'COMPLETED_WITH_EXCEPTIONS' : 'COMPLETED',
          policyVersion: '1.0.0',
          legalHolds,
          steps,
          backgroundJobs: {},
          auditHashes: ['genesis'],
          dataLineageSnapshot
        }

        // Publish completion notification
        await streamManager.publishCompletionNotification(workflowState)

        // Verify notification was stored
        const storedNotifications = await mockCompletionStream.getGroup(workflowId)
        expect(storedNotifications).toHaveLength(1)

        const notification = storedNotifications[0] as CompletionNotification
        
        // Verify next actions are appropriate
        expect(notification.nextActions).toBeDefined()
        const nextActions = notification.nextActions!

        // Should always have zombie check action
        const zombieCheckAction = nextActions.find(action => 
          action.action.includes('zombie data check')
        )
        expect(zombieCheckAction).toBeDefined()
        expect(zombieCheckAction!.priority).toBe('LOW')

        // Should have failed system remediation action if there are failures
        if (failedStepsCount > 0) {
          const remediationAction = nextActions.find(action => 
            action.action.includes('failed system deletions')
          )
          expect(remediationAction).toBeDefined()
          expect(remediationAction!.priority).toBe('HIGH')
          expect(remediationAction!.dueDate).toBeDefined()
        }

        // Should have legal hold review action if there are legal holds
        if (legalHoldsCount > 0) {
          const legalHoldAction = nextActions.find(action => 
            action.action.includes('legal holds')
          )
          expect(legalHoldAction).toBeDefined()
          expect(legalHoldAction!.priority).toBe('MEDIUM')
          expect(legalHoldAction!.dueDate).toBeDefined()
        }

        // Verify minimum number of actions
        const expectedMinActions = 1 + (failedStepsCount > 0 ? 1 : 0) + (legalHoldsCount > 0 ? 1 : 0)
        expect(nextActions.length).toBeGreaterThanOrEqual(expectedMinActions)
      }
    ), { numRuns: 50 })
  })

  it('should handle concurrent completion notifications for different workflows', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.uuid(), { minLength: 2, maxLength: 5 }), // multiple workflowIds
      fc.constantFrom('COMPLETED', 'COMPLETED_WITH_EXCEPTIONS'), // status
      async (workflowIds, status) => {
        // Clear previous data
        mockCompletionStream.clear()

        const userIdentifiers: UserIdentifiers = {
          userId: 'test-user',
          emails: ['test@example.com'],
          phones: [],
          aliases: []
        }

        const dataLineageSnapshot: DataLineageSnapshot = {
          systems: ['stripe', 'database'],
          identifiers: ['test-user', 'test@example.com'],
          capturedAt: new Date().toISOString()
        }

        // Publish completion notifications concurrently for different workflows
        const publishPromises = workflowIds.map(workflowId => {
          const workflowState: WorkflowState = {
            workflowId,
            userIdentifiers,
            status: status as WorkflowStatus,
            policyVersion: '1.0.0',
            legalHolds: [],
            steps: {
              'test-step': {
                status: 'DELETED',
                attempts: 1,
                evidence: { timestamp: new Date().toISOString() }
              }
            },
            backgroundJobs: {},
            auditHashes: ['genesis'],
            dataLineageSnapshot
          }

          return streamManager.publishCompletionNotification(workflowState)
        })

        await Promise.all(publishPromises)

        // Verify each workflow has exactly one completion notification
        for (const workflowId of workflowIds) {
          const storedNotifications = await mockCompletionStream.getGroup(workflowId)
          expect(storedNotifications).toHaveLength(1)
          expect(storedNotifications[0].workflowId).toBe(workflowId)
          expect(storedNotifications[0].status).toBe(status)
        }

        // Verify total number of events (2 per workflow: workflow-specific + global)
        const events = mockCompletionStream.getEvents()
        expect(events).toHaveLength(workflowIds.length * 2)

        // Verify each workflow got its own events
        const workflowEvents = events.filter(event => event.channel.groupId !== 'global')
        const workflowEventIds = workflowEvents.map(event => event.channel.groupId)
        expect(new Set(workflowEventIds)).toEqual(new Set(workflowIds))

        // Verify global events
        const globalEvents = events.filter(event => event.channel.groupId === 'global')
        expect(globalEvents).toHaveLength(workflowIds.length)
      }
    ), { numRuns: 30 })
  })

  it('should calculate duration correctly when startedAt is provided', async () => {
    await fc.assert(fc.asyncProperty(
      fc.uuid(), // workflowId
      fc.integer({ min: 1, max: 1440 }), // durationMinutes (1 minute to 24 hours)
      async (workflowId, durationMinutes) => {
        // Clear previous data
        mockCompletionStream.clear()

        const completedAt = new Date()
        const startedAt = new Date(completedAt.getTime() - durationMinutes * 60 * 1000)

        const userIdentifiers: UserIdentifiers = {
          userId: 'test-user',
          emails: ['test@example.com'],
          phones: [],
          aliases: []
        }

        const dataLineageSnapshot: DataLineageSnapshot = {
          systems: ['stripe', 'database'],
          identifiers: ['test-user', 'test@example.com'],
          capturedAt: startedAt.toISOString()
        }

        const workflowState: WorkflowState = {
          workflowId,
          userIdentifiers,
          status: 'COMPLETED',
          policyVersion: '1.0.0',
          legalHolds: [],
          steps: {},
          backgroundJobs: {},
          auditHashes: ['genesis'],
          dataLineageSnapshot
        }

        // Publish completion notification with specific start time
        await streamManager.publishCompletionNotification(
          workflowState,
          undefined,
          startedAt.toISOString()
        )

        // Verify duration calculation
        const storedNotifications = await mockCompletionStream.getGroup(workflowId)
        expect(storedNotifications).toHaveLength(1)

        const notification = storedNotifications[0] as CompletionNotification
        expect(notification.summary.duration.startedAt).toBe(startedAt.toISOString())
        
        // Allow for small timing differences (within 1 minute)
        const calculatedDuration = notification.summary.duration.totalMinutes
        expect(Math.abs(calculatedDuration - durationMinutes)).toBeLessThanOrEqual(1)
      }
    ), { numRuns: 50 })
  })
})