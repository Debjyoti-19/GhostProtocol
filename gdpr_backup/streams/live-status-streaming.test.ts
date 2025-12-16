/**
 * Property-Based Tests for Live Status Streaming
 * 
 * **Feature: gdpr-erasure-system, Property 19: Live Status Streaming**
 * **Validates: Requirements 7.1, 7.3**
 * 
 * Tests that workflow step execution and status changes publish real-time updates
 * through event streams to monitoring interfaces.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'
import { MonitoringStreamManager, StreamContext } from '../services/monitoring-stream-manager.js'
import { WorkflowStatusUpdate } from '../streams/index.js'
import { WorkflowStatus, StepStatus } from '../types/index.js'

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
}

// Mock logger
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
}

describe('Live Status Streaming Property Tests', () => {
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
   * Property 19: Live Status Streaming
   * For any workflow step execution or status change, the system should publish 
   * real-time updates through event streams to monitoring interfaces
   */
  it('should publish real-time updates for all workflow status changes', async () => {
    await fc.assert(fc.asyncProperty(
      // Generate random workflow data
      fc.uuid(),  // workflowId
      fc.constantFrom('STATUS_CHANGE', 'STEP_UPDATE', 'PROGRESS_UPDATE'), // update type
      fc.constantFrom('IN_PROGRESS', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED', 'AWAITING_MANUAL_REVIEW'), // status
      fc.option(fc.string({ minLength: 1, maxLength: 50 })), // stepName
      fc.option(fc.constantFrom('NOT_STARTED', 'IN_PROGRESS', 'DELETED', 'FAILED', 'LEGAL_HOLD')), // stepStatus
      fc.option(fc.record({
        totalSteps: fc.integer({ min: 1, max: 20 }),
        completedSteps: fc.integer({ min: 0, max: 20 }),
        failedSteps: fc.integer({ min: 0, max: 20 }),
        percentage: fc.integer({ min: 0, max: 100 })
      })), // progress
      async (workflowId, updateType, status, stepName, stepStatus, progress) => {
        // Clear previous events
        mockWorkflowStatusStream.clear()

        // Publish status update
        await streamManager.publishWorkflowStatusUpdate(
          workflowId,
          updateType,
          status as WorkflowStatus,
          {
            stepName,
            stepStatus: stepStatus as StepStatus,
            progress
          }
        )

        // Verify update was stored in stream
        const storedUpdates = await mockWorkflowStatusStream.getGroup(workflowId)
        expect(storedUpdates).toHaveLength(1)

        const storedUpdate = storedUpdates[0] as WorkflowStatusUpdate
        expect(storedUpdate.workflowId).toBe(workflowId)
        expect(storedUpdate.type).toBe(updateType)
        expect(storedUpdate.status).toBe(status)
        expect(storedUpdate.stepName).toBe(stepName)
        expect(storedUpdate.stepStatus).toBe(stepStatus)
        expect(storedUpdate.progress).toEqual(progress)

        // Verify ephemeral event was sent
        const events = mockWorkflowStatusStream.getEvents()
        expect(events).toHaveLength(1)
        expect(events[0].channel.groupId).toBe(workflowId)
        expect(events[0].event.type).toBe('status_update')
        expect(events[0].event.data).toEqual(storedUpdate)

        // Verify update has valid structure
        expect(storedUpdate.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        expect(new Date(storedUpdate.timestamp).getTime()).toBeGreaterThan(0)
      }
    ), { numRuns: 100 })
  })

  it('should maintain chronological order of status updates', async () => {
    await fc.assert(fc.asyncProperty(
      fc.uuid(), // workflowId
      fc.array(fc.record({
        type: fc.constantFrom('STATUS_CHANGE', 'STEP_UPDATE', 'PROGRESS_UPDATE'),
        status: fc.constantFrom('IN_PROGRESS', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED', 'AWAITING_MANUAL_REVIEW'),
        stepName: fc.option(fc.string({ minLength: 1, maxLength: 20 }))
      }), { minLength: 2, maxLength: 10 }),
      async (workflowId, updates) => {
        // Clear previous data
        mockWorkflowStatusStream.clear()

        const publishTimes: Date[] = []

        // Publish updates sequentially
        for (const update of updates) {
          const beforePublish = new Date()
          await streamManager.publishWorkflowStatusUpdate(
            workflowId,
            update.type as any,
            update.status as WorkflowStatus,
            { stepName: update.stepName }
          )
          publishTimes.push(beforePublish)
          
          // Small delay to ensure timestamp differences
          await new Promise(resolve => setTimeout(resolve, 1))
        }

        // Verify all updates were stored
        const storedUpdates = await mockWorkflowStatusStream.getGroup(workflowId)
        expect(storedUpdates).toHaveLength(updates.length)

        // Verify chronological order
        const timestamps = storedUpdates.map(update => new Date(update.timestamp))
        for (let i = 1; i < timestamps.length; i++) {
          expect(timestamps[i].getTime()).toBeGreaterThanOrEqual(timestamps[i - 1].getTime())
        }

        // Verify all events were sent
        const events = mockWorkflowStatusStream.getEvents()
        expect(events).toHaveLength(updates.length)
      }
    ), { numRuns: 50 })
  })

  it('should handle concurrent status updates for different workflows', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.uuid(), { minLength: 2, maxLength: 5 }), // multiple workflowIds
      fc.constantFrom('STATUS_CHANGE', 'STEP_UPDATE', 'PROGRESS_UPDATE'),
      fc.constantFrom('IN_PROGRESS', 'COMPLETED', 'FAILED'),
      async (workflowIds, updateType, status) => {
        // Clear previous data
        mockWorkflowStatusStream.clear()

        // Publish updates concurrently for different workflows
        const publishPromises = workflowIds.map(workflowId =>
          streamManager.publishWorkflowStatusUpdate(
            workflowId,
            updateType as any,
            status as WorkflowStatus
          )
        )

        await Promise.all(publishPromises)

        // Verify each workflow has exactly one update
        for (const workflowId of workflowIds) {
          const storedUpdates = await mockWorkflowStatusStream.getGroup(workflowId)
          expect(storedUpdates).toHaveLength(1)
          expect(storedUpdates[0].workflowId).toBe(workflowId)
          expect(storedUpdates[0].type).toBe(updateType)
          expect(storedUpdates[0].status).toBe(status)
        }

        // Verify total number of events matches number of workflows
        const events = mockWorkflowStatusStream.getEvents()
        expect(events).toHaveLength(workflowIds.length)

        // Verify each workflow got its own event
        const eventWorkflowIds = events.map(event => event.channel.groupId)
        expect(new Set(eventWorkflowIds)).toEqual(new Set(workflowIds))
      }
    ), { numRuns: 50 })
  })

  it('should preserve update data integrity across stream operations', async () => {
    await fc.assert(fc.asyncProperty(
      fc.uuid(),
      fc.constantFrom('STATUS_CHANGE', 'STEP_UPDATE', 'PROGRESS_UPDATE'),
      fc.constantFrom('IN_PROGRESS', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED', 'AWAITING_MANUAL_REVIEW'),
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.constantFrom('NOT_STARTED', 'IN_PROGRESS', 'DELETED', 'FAILED', 'LEGAL_HOLD'),
      fc.record({
        totalSteps: fc.integer({ min: 1, max: 20 }),
        completedSteps: fc.integer({ min: 0, max: 20 }),
        failedSteps: fc.integer({ min: 0, max: 20 }),
        percentage: fc.integer({ min: 0, max: 100 })
      }),
      fc.dictionary(fc.string(), fc.anything()),
      async (workflowId, updateType, status, stepName, stepStatus, progress, metadata) => {
        // Clear previous data
        mockWorkflowStatusStream.clear()

        // Publish update with all optional fields
        await streamManager.publishWorkflowStatusUpdate(
          workflowId,
          updateType as any,
          status as WorkflowStatus,
          {
            stepName,
            stepStatus: stepStatus as StepStatus,
            progress,
            metadata
          }
        )

        // Retrieve and verify stored data
        const storedUpdates = await mockWorkflowStatusStream.getGroup(workflowId)
        expect(storedUpdates).toHaveLength(1)

        const storedUpdate = storedUpdates[0]
        
        // Verify all fields are preserved exactly
        expect(storedUpdate.workflowId).toBe(workflowId)
        expect(storedUpdate.type).toBe(updateType)
        expect(storedUpdate.status).toBe(status)
        expect(storedUpdate.stepName).toBe(stepName)
        expect(storedUpdate.stepStatus).toBe(stepStatus)
        expect(storedUpdate.progress).toEqual(progress)
        expect(storedUpdate.metadata).toEqual(metadata)

        // Verify event data matches stored data
        const events = mockWorkflowStatusStream.getEvents()
        expect(events[0].event.data).toEqual(storedUpdate)
      }
    ), { numRuns: 100 })
  })
})