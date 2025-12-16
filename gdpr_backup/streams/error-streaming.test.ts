/**
 * Property-Based Tests for Error Streaming
 * 
 * **Feature: gdpr-erasure-system, Property 20: Error Streaming**
 * **Validates: Requirements 7.4**
 * 
 * Tests that error occurrences stream error details and remediation steps
 * to the monitoring interface.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'
import { MonitoringStreamManager, StreamContext, ErrorContext, RemediationInfo, ErrorImpact } from '../services/monitoring-stream-manager.js'
import { ErrorNotification } from '../streams/index.js'

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

describe('Error Streaming Property Tests', () => {
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
   * Property 20: Error Streaming
   * For any error occurrence, the system should stream error details and 
   * remediation steps to the monitoring interface
   */
  it('should stream error details and remediation for all error occurrences', async () => {
    await fc.assert(fc.asyncProperty(
      // Generate random error data
      fc.uuid(), // workflowId
      fc.constantFrom('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'), // severity
      fc.constantFrom('VALIDATION_ERROR', 'AUTHENTICATION_ERROR', 'SYSTEM_ERROR', 'BUSINESS_LOGIC_ERROR', 'INFRASTRUCTURE_ERROR', 'EXTERNAL_API_ERROR', 'LEGAL_HOLD_ERROR'), // category
      fc.record({
        code: fc.string({ minLength: 1, maxLength: 20 }),
        message: fc.string({ minLength: 1, maxLength: 100 }),
        details: fc.option(fc.string({ minLength: 1, maxLength: 200 })),
        stackTrace: fc.option(fc.string({ minLength: 1, maxLength: 500 }))
      }), // error
      fc.record({
        stepName: fc.option(fc.string({ minLength: 1, maxLength: 30 })),
        system: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
        userId: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
        requestId: fc.option(fc.uuid()),
        attemptNumber: fc.option(fc.integer({ min: 1, max: 10 }))
      }), // context
      fc.record({
        description: fc.string({ minLength: 1, maxLength: 200 }),
        actions: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
        retryable: fc.boolean(),
        escalationRequired: fc.boolean(),
        estimatedResolutionTime: fc.option(fc.string({ minLength: 1, maxLength: 20 }))
      }), // remediation
      fc.record({
        affectedSystems: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        dataAtRisk: fc.boolean(),
        complianceImpact: fc.constantFrom('NONE', 'LOW', 'MEDIUM', 'HIGH'),
        userImpact: fc.option(fc.string({ minLength: 1, maxLength: 100 }))
      }), // impact
      async (workflowId, severity, category, error, context, remediation, impact) => {
        // Clear previous events
        mockErrorStream.clear()

        // Publish error notification
        await streamManager.publishErrorNotification(
          workflowId,
          severity as any,
          category as any,
          error,
          context as ErrorContext,
          remediation as RemediationInfo,
          impact as ErrorImpact
        )

        // Verify error was stored in stream
        const storedErrors = await mockErrorStream.getGroup(workflowId)
        expect(storedErrors).toHaveLength(1)

        const storedError = storedErrors[0] as ErrorNotification
        expect(storedError.workflowId).toBe(workflowId)
        expect(storedError.severity).toBe(severity)
        expect(storedError.category).toBe(category)
        expect(storedError.error).toEqual(error)
        expect(storedError.context).toEqual(context)
        expect(storedError.remediation).toEqual(remediation)
        expect(storedError.impact).toEqual(impact)

        // Verify error has initial resolution status
        expect(storedError.resolution?.status).toBe('OPEN')

        // Verify ephemeral events were sent (workflow-specific and global)
        const events = mockErrorStream.getEvents()
        expect(events).toHaveLength(2)
        
        // Check workflow-specific event
        const workflowEvent = events.find(e => e.channel.groupId === workflowId)
        expect(workflowEvent).toBeDefined()
        expect(workflowEvent!.event.type).toBe('error_occurred')
        expect(workflowEvent!.event.data).toEqual(storedError)

        // Check global event
        const globalEvent = events.find(e => e.channel.groupId === 'global')
        expect(globalEvent).toBeDefined()
        expect(globalEvent!.event.type).toBe('error_occurred')
        expect(globalEvent!.event.data).toEqual(storedError)

        // Verify error has valid structure
        expect(storedError.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        expect(new Date(storedError.timestamp).getTime()).toBeGreaterThan(0)
      }
    ), { numRuns: 100 })
  })

  it('should handle error resolution updates correctly', async () => {
    await fc.assert(fc.asyncProperty(
      fc.uuid(), // workflowId
      fc.constantFrom('MEDIUM', 'HIGH', 'CRITICAL'), // severity
      fc.constantFrom('SYSTEM_ERROR', 'EXTERNAL_API_ERROR'), // category
      fc.constantFrom('IN_PROGRESS', 'RESOLVED', 'ESCALATED'), // resolution status
      fc.option(fc.string({ minLength: 1, maxLength: 50 })), // resolvedBy
      fc.option(fc.string({ minLength: 1, maxLength: 200 })), // resolution
      async (workflowId, severity, category, resolutionStatus, resolvedBy, resolution) => {
        // Clear previous data
        mockErrorStream.clear()

        // First, publish an error
        const error = {
          code: 'TEST_ERROR',
          message: 'Test error message'
        }
        const context: ErrorContext = { stepName: 'test-step' }
        const remediation: RemediationInfo = {
          description: 'Test remediation',
          actions: ['action1', 'action2'],
          retryable: true,
          escalationRequired: false
        }
        const impact: ErrorImpact = {
          affectedSystems: ['system1'],
          dataAtRisk: false,
          complianceImpact: 'LOW'
        }

        await streamManager.publishErrorNotification(
          workflowId,
          severity as any,
          category as any,
          error,
          context,
          remediation,
          impact
        )

        // Get the error ID
        const storedErrors = await mockErrorStream.getGroup(workflowId)
        const errorId = storedErrors[0].id

        // Clear events from initial publication (but keep the stored data)
        mockErrorStream.clearEvents()

        // Update error resolution
        await streamManager.updateErrorResolution(
          workflowId,
          errorId,
          resolutionStatus as any,
          resolvedBy,
          resolution
        )

        // Verify resolution was updated
        const updatedErrors = await mockErrorStream.getGroup(workflowId)
        expect(updatedErrors).toHaveLength(1)

        const updatedError = updatedErrors[0] as ErrorNotification
        expect(updatedError.resolution?.status).toBe(resolutionStatus)
        expect(updatedError.resolution?.resolvedBy).toBe(resolvedBy)
        expect(updatedError.resolution?.resolution).toBe(resolution)
        expect(updatedError.resolution?.resolvedAt).toBeDefined()

        // Verify resolution event was sent
        const events = mockErrorStream.getEvents()
        expect(events).toHaveLength(1)
        expect(events[0].channel.groupId).toBe(workflowId)
        expect(events[0].event.type).toBe('error_resolved')
        expect(events[0].event.data).toEqual(updatedError)
      }
    ), { numRuns: 50 })
  })

  it('should maintain error severity ordering and categorization', async () => {
    await fc.assert(fc.asyncProperty(
      fc.uuid(), // workflowId
      fc.array(fc.record({
        severity: fc.constantFrom('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
        category: fc.constantFrom('VALIDATION_ERROR', 'SYSTEM_ERROR', 'EXTERNAL_API_ERROR'),
        code: fc.string({ minLength: 1, maxLength: 20 }),
        message: fc.string({ minLength: 1, maxLength: 100 })
      }), { minLength: 2, maxLength: 10 }),
      async (workflowId, errorSpecs) => {
        // Clear previous data
        mockErrorStream.clear()

        const context: ErrorContext = { stepName: 'test-step' }
        const remediation: RemediationInfo = {
          description: 'Test remediation',
          actions: ['action1'],
          retryable: true,
          escalationRequired: false
        }
        const impact: ErrorImpact = {
          affectedSystems: ['system1'],
          dataAtRisk: false,
          complianceImpact: 'LOW'
        }

        // Publish all errors
        for (const errorSpec of errorSpecs) {
          await streamManager.publishErrorNotification(
            workflowId,
            errorSpec.severity as any,
            errorSpec.category as any,
            { code: errorSpec.code, message: errorSpec.message },
            context,
            remediation,
            impact
          )
        }

        // Verify all errors were stored
        const storedErrors = await mockErrorStream.getGroup(workflowId)
        expect(storedErrors).toHaveLength(errorSpecs.length)

        // Verify each error maintains its properties
        for (let i = 0; i < errorSpecs.length; i++) {
          const storedError = storedErrors[i] as ErrorNotification
          const originalSpec = errorSpecs[i]
          
          expect(storedError.severity).toBe(originalSpec.severity)
          expect(storedError.category).toBe(originalSpec.category)
          expect(storedError.error.code).toBe(originalSpec.code)
          expect(storedError.error.message).toBe(originalSpec.message)
        }

        // Verify all errors have unique IDs
        const errorIds = storedErrors.map(error => error.id)
        expect(new Set(errorIds).size).toBe(errorIds.length)

        // Verify chronological order
        const timestamps = storedErrors.map(error => new Date(error.timestamp))
        for (let i = 1; i < timestamps.length; i++) {
          expect(timestamps[i].getTime()).toBeGreaterThanOrEqual(timestamps[i - 1].getTime())
        }
      }
    ), { numRuns: 50 })
  })

  it('should handle concurrent error notifications for different workflows', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.uuid(), { minLength: 2, maxLength: 5 }), // multiple workflowIds
      fc.constantFrom('HIGH', 'CRITICAL'), // severity
      fc.constantFrom('SYSTEM_ERROR', 'EXTERNAL_API_ERROR'), // category
      async (workflowIds, severity, category) => {
        // Clear previous data
        mockErrorStream.clear()

        const error = { code: 'CONCURRENT_TEST', message: 'Concurrent test error' }
        const context: ErrorContext = { stepName: 'concurrent-step' }
        const remediation: RemediationInfo = {
          description: 'Concurrent remediation',
          actions: ['action1'],
          retryable: true,
          escalationRequired: false
        }
        const impact: ErrorImpact = {
          affectedSystems: ['system1'],
          dataAtRisk: false,
          complianceImpact: 'MEDIUM'
        }

        // Publish errors concurrently for different workflows
        const publishPromises = workflowIds.map(workflowId =>
          streamManager.publishErrorNotification(
            workflowId,
            severity as any,
            category as any,
            error,
            context,
            remediation,
            impact
          )
        )

        await Promise.all(publishPromises)

        // Verify each workflow has exactly one error
        for (const workflowId of workflowIds) {
          const storedErrors = await mockErrorStream.getGroup(workflowId)
          expect(storedErrors).toHaveLength(1)
          expect(storedErrors[0].workflowId).toBe(workflowId)
          expect(storedErrors[0].severity).toBe(severity)
          expect(storedErrors[0].category).toBe(category)
        }

        // Verify total number of events (2 per workflow: workflow-specific + global)
        const events = mockErrorStream.getEvents()
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
})