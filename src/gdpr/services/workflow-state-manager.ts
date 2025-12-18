/**
 * Workflow State Management Service for GhostProtocol
 * 
 * Handles workflow state management using Motia state primitives including:
 * - User locking mechanism to prevent concurrent workflows
 * - Workflow creation with data lineage snapshot capture
 * - Idempotency checking with request hash validation
 * - Audit trail management with hash chains
 */

import { StateManager } from 'motia'
import { v4 as uuidv4 } from 'uuid'
import { 
  WorkflowState, 
  ErasureRequest, 
  UserIdentifiers, 
  DataLineageSnapshot,
  WorkflowStatus,
  StepStatus,
  BackgroundJob,
  LegalHold
} from '../types/index.js'
import { 
  WorkflowLockError, 
  WorkflowStateError, 
  IdentityValidationError 
} from '../errors/index.js'
import { CryptoUtils } from '../utils/index.js'
import { PolicyManager } from './policy-manager.js'

export interface WorkflowCreationOptions {
  userIdentifiers: UserIdentifiers
  jurisdiction: 'EU' | 'US' | 'OTHER'
  requestedBy: {
    userId: string
    role: string
    organization: string
  }
  legalProof: {
    type: 'SIGNED_REQUEST' | 'LEGAL_FORM' | 'OTP_VERIFIED'
    evidence: string
    verifiedAt: string
  }
  policyVersion?: string
}

export interface WorkflowLock {
  workflowId: string
  requestId: string
  lockedAt: string
  lockedBy: string
}

export interface RequestHashEntry {
  requestId: string
  workflowId: string
  createdAt: string
  hash: string
}

export interface StateUpdateOptions {
  auditEvent?: string
  evidence?: any
  skipHashChain?: boolean
}

/**
 * Workflow State Manager
 * 
 * Provides comprehensive workflow state management with concurrency control,
 * idempotency checking, and audit trail maintenance.
 */
export class WorkflowStateManager {
  private state: StateManager
  private logger: any
  private policyManager: PolicyManager

  constructor(state: StateManager, logger: any) {
    this.state = state
    this.logger = logger
    this.policyManager = new PolicyManager(state, logger)
  }

  /**
   * Creates a new workflow with proper concurrency control and idempotency checking
   * 
   * Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 11.1, 11.3
   */
  async createWorkflow(options: WorkflowCreationOptions): Promise<{
    workflowId: string
    requestId: string
    workflowState: WorkflowState
    erasureRequest: ErasureRequest
    isExisting: boolean
  }> {
    const requestId = uuidv4()
    const workflowId = uuidv4()
    const createdAt = new Date().toISOString()

    this.logger.info('Creating workflow', { 
      requestId, 
      workflowId, 
      userId: options.userIdentifiers.userId,
      jurisdiction: options.jurisdiction
    })

    // Get policy for jurisdiction (Requirement 11.1)
    const policy = await this.policyManager.getPolicyForJurisdiction(options.jurisdiction)
    const policyVersion = options.policyVersion || policy.version

    // Step 1: Check for existing workflows using user identifiers (Requirement 1.3)
    const existingLock = await this.checkUserLock(options.userIdentifiers.userId)
    if (existingLock) {
      this.logger.warn('Concurrent workflow detected', { 
        requestId, 
        existingWorkflowId: existingLock.workflowId,
        userId: options.userIdentifiers.userId 
      })
      
      // Return existing workflow information
      const existingWorkflowState = await this.getWorkflowState(existingLock.workflowId)
      const existingRequest = await this.getErasureRequest(existingLock.requestId)
      
      if (!existingWorkflowState || !existingRequest) {
        // Clean up inconsistent lock and continue with new workflow creation
        await this.releaseUserLock(options.userIdentifiers.userId)
        this.logger.warn('Cleaned up inconsistent lock, proceeding with new workflow', {
          userId: options.userIdentifiers.userId,
          existingWorkflowId: existingLock.workflowId
        })
      } else {
        return {
          workflowId: existingLock.workflowId,
          requestId: existingLock.requestId,
          workflowState: existingWorkflowState,
          erasureRequest: existingRequest,
          isExisting: true
        }
      }
    }

    // Step 2: Check for duplicate requests using hash (Requirement 1.5, 1.6)
    const requestHash = this.createRequestHash(options)
    const existingRequest = await this.checkRequestHash(requestHash)
    
    if (existingRequest) {
      this.logger.info('Duplicate request detected via hash', { 
        requestId, 
        existingRequestId: existingRequest.requestId,
        existingWorkflowId: existingRequest.workflowId 
      })

      // Return existing workflow information
      const existingWorkflowState = await this.getWorkflowState(existingRequest.workflowId)
      const existingErasureRequest = await this.getErasureRequest(existingRequest.requestId)
      
      if (!existingWorkflowState || !existingErasureRequest) {
        // Clean up inconsistent hash and continue with new workflow creation
        await this.state.delete('request_hashes', requestHash)
        this.logger.warn('Cleaned up inconsistent hash, proceeding with new workflow', {
          requestHash,
          existingWorkflowId: existingRequest.workflowId
        })
      } else {
        return {
          workflowId: existingRequest.workflowId,
          requestId: existingRequest.requestId,
          workflowState: existingWorkflowState,
          erasureRequest: existingErasureRequest,
          isExisting: true
        }
      }
    }

    // Step 3: Acquire per-user lock (Requirement 1.3)
    await this.acquireUserLock(options.userIdentifiers.userId, workflowId, requestId, options.requestedBy.userId)

    // Step 4: Store request hash for idempotency (Requirement 1.5)
    await this.storeRequestHash(requestHash, requestId, workflowId, createdAt)

    // Step 5: Create data lineage snapshot (Requirement 1.4, 1.7)
    const dataLineageSnapshot = await this.createDataLineageSnapshot(options.userIdentifiers)

    // Step 6: Create initial workflow state with policy version (Requirement 11.3)
    const initialWorkflowState: WorkflowState = {
      workflowId,
      userIdentifiers: options.userIdentifiers,
      status: 'IN_PROGRESS',
      policyVersion,
      legalHolds: [],
      steps: {},
      backgroundJobs: {},
      auditHashes: [CryptoUtils.createHash('GENESIS')], // Genesis hash
      dataLineageSnapshot
    }

    // Record policy application (Requirement 11.3)
    await this.policyManager.recordPolicyApplication(workflowId, options.jurisdiction)

    // Step 7: Create erasure request
    const erasureRequest: ErasureRequest = {
      requestId,
      workflowId,
      userIdentifiers: options.userIdentifiers,
      legalProof: options.legalProof,
      jurisdiction: options.jurisdiction,
      requestedBy: options.requestedBy,
      createdAt
    }

    // Step 8: Store workflow state and request
    await this.storeWorkflowState(initialWorkflowState, {
      auditEvent: 'WORKFLOW_CREATED',
      evidence: {
        requestId,
        dataLineageSnapshot,
        requestedBy: options.requestedBy
      }
    })

    await this.storeErasureRequest(erasureRequest)

    this.logger.info('Workflow created successfully', { 
      requestId, 
      workflowId,
      userId: options.userIdentifiers.userId,
      jurisdiction: options.jurisdiction,
      policyVersion,
      systemsDetected: dataLineageSnapshot.systems.length,
      identifiersDetected: dataLineageSnapshot.identifiers.length
    })

    return {
      workflowId,
      requestId,
      workflowState: initialWorkflowState,
      erasureRequest,
      isExisting: false
    }
  }

  /**
   * Updates workflow state with audit trail maintenance
   */
  async updateWorkflowState(
    workflowId: string, 
    updates: Partial<WorkflowState>, 
    options: StateUpdateOptions = {}
  ): Promise<WorkflowState> {
    const currentState = await this.getWorkflowState(workflowId)
    if (!currentState) {
      throw new WorkflowStateError(`Workflow not found: ${workflowId}`)
    }

    // Create updated state
    const updatedState: WorkflowState = {
      ...currentState,
      ...updates,
      workflowId // Ensure workflowId is not overwritten
    }

    // Update audit hash chain if not skipped
    if (!options.skipHashChain) {
      const auditEntry = {
        event: options.auditEvent || 'STATE_UPDATED',
        timestamp: new Date().toISOString(),
        workflowId,
        changes: updates,
        evidence: options.evidence
      }

      const previousHash = currentState.auditHashes[currentState.auditHashes.length - 1]
      const newHash = CryptoUtils.createHashChain(previousHash, auditEntry)
      updatedState.auditHashes = [...currentState.auditHashes, newHash]
    }

    await this.storeWorkflowState(updatedState)

    this.logger.info('Workflow state updated', { 
      workflowId, 
      auditEvent: options.auditEvent,
      hashChainLength: updatedState.auditHashes.length
    })

    return updatedState
  }

  /**
   * Updates a specific step status with evidence
   */
  async updateStepStatus(
    workflowId: string,
    stepName: string,
    status: StepStatus,
    evidence?: any,
    incrementAttempts: boolean = false
  ): Promise<WorkflowState> {
    const currentState = await this.getWorkflowState(workflowId)
    if (!currentState) {
      throw new WorkflowStateError(`Workflow not found: ${workflowId}`)
    }

    const currentStep = currentState.steps[stepName] || {
      status: 'NOT_STARTED',
      attempts: 0,
      evidence: {
        timestamp: new Date().toISOString()
      }
    }

    const updatedStep = {
      ...currentStep,
      status,
      attempts: incrementAttempts ? currentStep.attempts + 1 : currentStep.attempts,
      evidence: {
        ...currentStep.evidence,
        timestamp: new Date().toISOString(),
        ...(evidence && { receipt: JSON.stringify(evidence), apiResponse: evidence })
      }
    }

    const updates = {
      steps: {
        ...currentState.steps,
        [stepName]: updatedStep
      }
    }

    return this.updateWorkflowState(workflowId, updates, {
      auditEvent: 'STEP_STATUS_UPDATED',
      evidence: {
        stepName,
        status,
        attempts: updatedStep.attempts,
        evidence
      }
    })
  }

  /**
   * Adds or updates a background job
   */
  async updateBackgroundJob(
    workflowId: string,
    job: BackgroundJob
  ): Promise<WorkflowState> {
    const currentState = await this.getWorkflowState(workflowId)
    if (!currentState) {
      throw new WorkflowStateError(`Workflow not found: ${workflowId}`)
    }

    const updates = {
      backgroundJobs: {
        ...currentState.backgroundJobs,
        [job.jobId]: job
      }
    }

    return this.updateWorkflowState(workflowId, updates, {
      auditEvent: 'BACKGROUND_JOB_UPDATED',
      evidence: {
        jobId: job.jobId,
        jobType: job.type,
        status: job.status,
        progress: job.progress
      }
    })
  }

  /**
   * Adds a legal hold to the workflow
   */
  async addLegalHold(
    workflowId: string,
    legalHold: LegalHold
  ): Promise<WorkflowState> {
    const currentState = await this.getWorkflowState(workflowId)
    if (!currentState) {
      throw new WorkflowStateError(`Workflow not found: ${workflowId}`)
    }

    const updates = {
      legalHolds: [...currentState.legalHolds, legalHold]
    }

    return this.updateWorkflowState(workflowId, updates, {
      auditEvent: 'LEGAL_HOLD_ADDED',
      evidence: legalHold
    })
  }

  /**
   * Verifies audit trail integrity
   */
  async verifyAuditTrail(workflowId: string): Promise<boolean> {
    const workflowState = await this.getWorkflowState(workflowId)
    if (!workflowState) {
      throw new WorkflowStateError(`Workflow not found: ${workflowId}`)
    }

    // For now, we just verify the hash chain exists and has proper format
    // In a full implementation, we would reconstruct the audit events and verify each hash
    const hashes = workflowState.auditHashes
    
    if (hashes.length === 0) {
      return false
    }

    // Verify all hashes are valid SHA-256 format
    const sha256Regex = /^[a-f0-9]{64}$/
    return hashes.every(hash => sha256Regex.test(hash))
  }

  /**
   * Releases user lock when workflow completes
   */
  async releaseUserLock(userId: string): Promise<void> {
    const userKey = `user_lock:${userId}`
    await this.state.delete('workflow_locks', userKey)
    
    this.logger.info('User lock released', { userId })
  }

  /**
   * Gets workflow state
   */
  async getWorkflowState(workflowId: string): Promise<WorkflowState | null> {
    return await this.state.get('workflows', workflowId)
  }

  /**
   * Gets erasure request
   */
  async getErasureRequest(requestId: string): Promise<ErasureRequest | null> {
    return await this.state.get('requests', requestId)
  }

  /**
   * Gets the policy manager instance
   */
  getPolicyManager(): PolicyManager {
    return this.policyManager
  }

  // Private helper methods

  private async checkUserLock(userId: string): Promise<WorkflowLock | null> {
    const userKey = `user_lock:${userId}`
    return await this.state.get('workflow_locks', userKey)
  }

  private async acquireUserLock(
    userId: string, 
    workflowId: string, 
    requestId: string, 
    lockedBy: string
  ): Promise<void> {
    const userKey = `user_lock:${userId}`
    const lockData: WorkflowLock = {
      workflowId,
      requestId,
      lockedAt: new Date().toISOString(),
      lockedBy
    }

    await this.state.set('workflow_locks', userKey, lockData)
    
    this.logger.info('User lock acquired', { userId, workflowId, requestId })
  }

  private createRequestHash(options: WorkflowCreationOptions): string {
    const hashData = {
      userIdentifiers: options.userIdentifiers,
      legalProof: options.legalProof,
      jurisdiction: options.jurisdiction
    }
    
    return CryptoUtils.createHash(JSON.stringify(hashData))
  }

  private async checkRequestHash(hash: string): Promise<RequestHashEntry | null> {
    return await this.state.get('request_hashes', hash)
  }

  private async storeRequestHash(
    hash: string, 
    requestId: string, 
    workflowId: string, 
    createdAt: string
  ): Promise<void> {
    const hashEntry: RequestHashEntry = {
      requestId,
      workflowId,
      createdAt,
      hash
    }

    await this.state.set('request_hashes', hash, hashEntry)
  }

  private async createDataLineageSnapshot(userIdentifiers: UserIdentifiers): Promise<DataLineageSnapshot> {
    // In a real implementation, this would dynamically discover connected systems
    // For now, we use a static list based on the design document
    const detectedSystems = [
      'stripe',
      'database', 
      'intercom',
      'sendgrid',
      'crm',
      'analytics'
    ]

    // Collect all identifiers and remove duplicates
    const allIdentifiers = [
      userIdentifiers.userId,
      ...userIdentifiers.emails,
      ...userIdentifiers.phones,
      ...userIdentifiers.aliases
    ]

    // Remove duplicates using Set
    const uniqueIdentifiers = Array.from(new Set(allIdentifiers))

    return {
      systems: detectedSystems,
      identifiers: uniqueIdentifiers,
      capturedAt: new Date().toISOString()
    }
  }

  private async storeWorkflowState(
    workflowState: WorkflowState, 
    options: StateUpdateOptions = {}
  ): Promise<void> {
    await this.state.set('workflows', workflowState.workflowId, workflowState)
  }

  private async storeErasureRequest(erasureRequest: ErasureRequest): Promise<void> {
    await this.state.set('requests', erasureRequest.requestId, erasureRequest)
  }
}