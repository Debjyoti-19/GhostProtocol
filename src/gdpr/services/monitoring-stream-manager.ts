/**
 * Monitoring Stream Manager for GhostProtocol
 * 
 * Manages real-time streaming for workflow monitoring, error notifications,
 * and completion notifications. Provides helper methods for publishing
 * updates to the appropriate streams.
 * 
 * Requirements: 7.1, 7.3, 7.4, 7.5
 */

import { v4 as uuidv4 } from 'uuid'
import { 
  WorkflowStatusUpdate,
  ErrorNotification,
  CompletionNotification
} from '../../streams/index.js'
import { 
  WorkflowState, 
  WorkflowStatus, 
  StepStatus,
  CertificateOfDestruction
} from '../types/index.js'

export interface StreamContext {
  workflowStatus: any
  errorNotifications: any
  completionNotifications: any
}

export interface ProgressInfo {
  totalSteps: number
  completedSteps: number
  failedSteps: number
  percentage: number
}

export interface ErrorContext {
  stepName?: string
  system?: string
  userId?: string
  requestId?: string
  attemptNumber?: number
}

export interface RemediationInfo {
  description: string
  actions: string[]
  retryable: boolean
  escalationRequired: boolean
  estimatedResolutionTime?: string
}

export interface ErrorImpact {
  affectedSystems: string[]
  dataAtRisk: boolean
  complianceImpact: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'
  userImpact?: string
}

/**
 * Monitoring Stream Manager
 * 
 * Provides centralized management of real-time monitoring streams
 * for workflow status, errors, and completion notifications.
 */
export class MonitoringStreamManager {
  private streams: StreamContext
  private logger: any

  constructor(streams: StreamContext, logger: any) {
    this.streams = streams
    this.logger = logger
  }

  /**
   * Publishes workflow status update
   * Requirements: 7.1, 7.3
   */
  async publishWorkflowStatusUpdate(
    workflowId: string,
    type: 'STATUS_CHANGE' | 'STEP_UPDATE' | 'PROGRESS_UPDATE',
    status: WorkflowStatus,
    options: {
      stepName?: string
      stepStatus?: StepStatus
      progress?: ProgressInfo
      metadata?: Record<string, any>
    } = {}
  ): Promise<void> {
    const updateId = uuidv4()
    const timestamp = new Date().toISOString()

    const statusUpdate: any = {
      id: updateId,
      workflowId,
      timestamp,
      type,
      status
    }
    
    if (options.stepName !== undefined) statusUpdate.stepName = options.stepName
    if (options.stepStatus !== undefined) statusUpdate.stepStatus = options.stepStatus
    if (options.progress !== undefined) statusUpdate.progress = options.progress
    if (options.metadata !== undefined) statusUpdate.metadata = options.metadata

    try {
      // Store in stream with workflowId as groupId and updateId as itemId
      await this.streams.workflowStatus.set(workflowId, updateId, statusUpdate)

      // Send ephemeral event for real-time updates
      await this.streams.workflowStatus.send(
        { groupId: workflowId },
        { type: 'status_update', data: statusUpdate }
      )

      this.logger.info('Workflow status update published', {
        workflowId,
        updateId,
        type,
        status,
        stepName: options.stepName
      })
    } catch (error) {
      this.logger.error('Failed to publish workflow status update', {
        workflowId,
        updateId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * Publishes error notification with remediation details
   * Requirements: 7.4
   */
  async publishErrorNotification(
    workflowId: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    category: ErrorNotification['category'],
    error: {
      code: string
      message: string
      details?: string
      stackTrace?: string
    },
    context: ErrorContext,
    remediation: RemediationInfo,
    impact: ErrorImpact
  ): Promise<void> {
    const errorId = uuidv4()
    const timestamp = new Date().toISOString()

    const errorNotification: ErrorNotification = {
      id: errorId,
      workflowId,
      timestamp,
      severity,
      category,
      error,
      context,
      remediation,
      impact,
      resolution: {
        status: 'OPEN'
      }
    }

    try {
      // Store in stream with workflowId as groupId and errorId as itemId
      await this.streams.errorNotifications.set(workflowId, errorId, errorNotification)

      // Send ephemeral event for immediate notification
      await this.streams.errorNotifications.send(
        { groupId: workflowId },
        { type: 'error_occurred', data: errorNotification }
      )

      // Also send to global error monitoring channel
      await this.streams.errorNotifications.send(
        { groupId: 'global' },
        { type: 'error_occurred', data: errorNotification }
      )

      this.logger.error('Error notification published', {
        workflowId,
        errorId,
        severity,
        category,
        errorCode: error.code,
        stepName: context.stepName
      })
    } catch (publishError) {
      this.logger.error('Failed to publish error notification', {
        workflowId,
        errorId,
        originalError: error.message,
        publishError: publishError instanceof Error ? publishError.message : String(publishError)
      })
      throw publishError
    }
  }

  /**
   * Publishes completion notification for compliance teams
   * Requirements: 7.5
   */
  async publishCompletionNotification(
    workflowState: WorkflowState,
    certificate?: CertificateOfDestruction,
    startedAt?: string
  ): Promise<void> {
    const notificationId = uuidv4()
    const timestamp = new Date().toISOString()
    const completedAt = timestamp

    // Calculate summary statistics
    const stepEntries = Object.entries(workflowState.steps)
    const systemsDeleted = stepEntries.filter(([_, step]) => step.status === 'DELETED').length
    const systemsFailed = stepEntries.filter(([_, step]) => step.status === 'FAILED').length
    const legalHolds = workflowState.legalHolds.length

    const backgroundJobEntries = Object.entries(workflowState.backgroundJobs)
    const jobsCompleted = backgroundJobEntries.filter(([_, job]) => job.status === 'COMPLETED').length
    const jobsFailed = backgroundJobEntries.filter(([_, job]) => job.status === 'FAILED').length
    const totalPiiFindings = backgroundJobEntries.reduce((sum, [_, job]) => sum + job.findings.length, 0)

    // Calculate duration
    const startTime = startedAt ? new Date(startedAt) : new Date(completedAt)
    const endTime = new Date(completedAt)
    const totalMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60))

    // Determine next actions
    const nextActions = []
    if (systemsFailed > 0) {
      nextActions.push({
        action: 'Review failed system deletions and implement remediation',
        priority: 'HIGH' as const,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      })
    }
    if (legalHolds > 0) {
      nextActions.push({
        action: 'Review legal holds and schedule follow-up deletions',
        priority: 'MEDIUM' as const,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
    }

    // Schedule zombie check
    const zombieCheckDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    nextActions.push({
      action: 'Automated zombie data check scheduled',
      priority: 'LOW' as const,
      dueDate: zombieCheckDate
    })

    const completionNotification: CompletionNotification = {
      id: notificationId,
      workflowId: workflowState.workflowId,
      timestamp,
      type: 'WORKFLOW_COMPLETED',
      status: workflowState.status === 'COMPLETED' ? 'COMPLETED' : 'COMPLETED_WITH_EXCEPTIONS',
      summary: {
        userIdentifiers: {
          userId: workflowState.userIdentifiers.userId,
          emailCount: workflowState.userIdentifiers.emails.length,
          phoneCount: workflowState.userIdentifiers.phones.length,
          aliasCount: workflowState.userIdentifiers.aliases.length
        },
        duration: {
          startedAt: startTime.toISOString(),
          completedAt,
          totalMinutes
        },
        systems: {
          total: stepEntries.length,
          deleted: systemsDeleted,
          failed: systemsFailed,
          legalHolds
        },
        backgroundJobs: {
          total: backgroundJobEntries.length,
          completed: jobsCompleted,
          failed: jobsFailed,
          piiFindings: totalPiiFindings
        }
      },
      certificateId: certificate?.certificateId,
      certificate: certificate ? {
        certificateId: certificate.certificateId,
        auditHashRoot: certificate.auditHashRoot,
        signature: certificate.signature
      } : undefined,
      legalHolds: workflowState.legalHolds.map(hold => ({
        system: hold.system,
        reason: hold.reason,
        expiresAt: hold.expiresAt
      })),
      compliance: {
        jurisdiction: 'EU', // TODO: Get from workflow context
        policyVersion: workflowState.policyVersion,
        zombieCheckScheduled: true,
        zombieCheckDate
      },
      nextActions,
      metadata: {
        exceptions: systemsFailed > 0 ? stepEntries
          .filter(([_, step]) => step.status === 'FAILED')
          .map(([stepName, step]) => ({
            system: stepName,
            error: step.evidence.receipt || 'Unknown error',
            remediation: 'Manual intervention required'
          })) : undefined
      }
    }

    try {
      // Store in stream with workflowId as groupId and notificationId as itemId
      await this.streams.completionNotifications.set(
        workflowState.workflowId, 
        notificationId, 
        completionNotification
      )

      // Send ephemeral event for immediate notification
      await this.streams.completionNotifications.send(
        { groupId: workflowState.workflowId },
        { type: 'workflow_completed', data: completionNotification }
      )

      // Also send to global completion monitoring channel
      await this.streams.completionNotifications.send(
        { groupId: 'global' },
        { type: 'workflow_completed', data: completionNotification }
      )

      this.logger.info('Completion notification published', {
        workflowId: workflowState.workflowId,
        notificationId,
        status: completionNotification.status,
        systemsDeleted,
        systemsFailed,
        certificateId: certificate?.certificateId
      })
    } catch (error) {
      this.logger.error('Failed to publish completion notification', {
        workflowId: workflowState.workflowId,
        notificationId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * Updates error resolution status
   */
  async updateErrorResolution(
    workflowId: string,
    errorId: string,
    status: 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED',
    resolvedBy?: string,
    resolution?: string
  ): Promise<void> {
    try {
      const existingError = await this.streams.errorNotifications.get(workflowId, errorId)
      if (!existingError) {
        throw new Error(`Error notification not found: ${errorId}`)
      }

      const updatedError: ErrorNotification = {
        ...existingError,
        resolution: {
          status,
          resolvedAt: new Date().toISOString(),
          resolvedBy,
          resolution
        }
      }

      await this.streams.errorNotifications.set(workflowId, errorId, updatedError)

      // Send ephemeral event for resolution update
      await this.streams.errorNotifications.send(
        { groupId: workflowId },
        { type: 'error_resolved', data: updatedError }
      )

      this.logger.info('Error resolution updated', {
        workflowId,
        errorId,
        status,
        resolvedBy
      })
    } catch (error) {
      this.logger.error('Failed to update error resolution', {
        workflowId,
        errorId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * Gets workflow status history
   */
  async getWorkflowStatusHistory(workflowId: string): Promise<WorkflowStatusUpdate[]> {
    try {
      return await this.streams.workflowStatus.getGroup(workflowId)
    } catch (error) {
      this.logger.error('Failed to get workflow status history', {
        workflowId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * Gets error notifications for a workflow
   */
  async getWorkflowErrors(workflowId: string): Promise<ErrorNotification[]> {
    try {
      return await this.streams.errorNotifications.getGroup(workflowId)
    } catch (error) {
      this.logger.error('Failed to get workflow errors', {
        workflowId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * Gets completion notifications for a workflow
   */
  async getWorkflowCompletions(workflowId: string): Promise<CompletionNotification[]> {
    try {
      return await this.streams.completionNotifications.getGroup(workflowId)
    } catch (error) {
      this.logger.error('Failed to get workflow completions', {
        workflowId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }
}