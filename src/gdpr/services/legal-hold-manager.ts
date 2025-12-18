/**
 * Legal Hold Manager for GhostProtocol
 * 
 * Provides centralized management of legal holds including:
 * - Adding legal holds to specific systems
 * - Removing legal holds when they expire
 * - Checking if systems are under legal hold
 * - Managing legal hold expiration
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { WorkflowStateManager } from './workflow-state-manager.js'
import { LegalHold, WorkflowState } from '../types/index.js'

export interface LegalHoldOptions {
  system: string
  reason: string
  expiresAt?: string
}

export interface LegalHoldStatus {
  isHeld: boolean
  holds: LegalHold[]
  hasExpired: boolean
}

/**
 * Legal Hold Manager
 * 
 * Manages legal holds for GDPR erasure workflows, ensuring that systems
 * under legal hold are excluded from deletion operations until the hold
 * is lifted or expires.
 */
export class LegalHoldManager {
  private stateManager: WorkflowStateManager
  private logger: any

  constructor(stateManager: WorkflowStateManager, logger: any) {
    this.stateManager = stateManager
    this.logger = logger
  }

  /**
   * Adds a legal hold to a specific system
   * 
   * Requirement 9.1: Mark specific systems as LEGAL_HOLD status
   * Requirement 9.4: Record hold decisions with timestamps and legal basis
   */
  async addLegalHold(
    workflowId: string,
    options: LegalHoldOptions
  ): Promise<WorkflowState> {
    this.logger.info('Adding legal hold', {
      workflowId,
      system: options.system,
      reason: options.reason,
      expiresAt: options.expiresAt
    })

    const legalHold: LegalHold = {
      system: options.system,
      reason: options.reason,
      expiresAt: options.expiresAt
    }

    // Add legal hold to workflow state (this updates audit trail automatically)
    const updatedState = await this.stateManager.addLegalHold(workflowId, legalHold)

    // Update step status to LEGAL_HOLD
    const stepName = `${options.system}-deletion`
    await this.stateManager.updateStepStatus(
      workflowId,
      stepName,
      'LEGAL_HOLD',
      { reason: options.reason, expiresAt: options.expiresAt }
    )

    this.logger.info('Legal hold added successfully', {
      workflowId,
      system: options.system
    })

    return updatedState
  }

  /**
   * Removes a legal hold from a specific system
   * 
   * Requirement 9.5: Allow resuming deletion operations when legal holds expire
   */
  async removeLegalHold(
    workflowId: string,
    system: string,
    reason?: string
  ): Promise<WorkflowState> {
    this.logger.info('Removing legal hold', {
      workflowId,
      system,
      reason
    })

    const currentState = await this.stateManager.getWorkflowState(workflowId)
    if (!currentState) {
      throw new Error(`Workflow not found: ${workflowId}`)
    }

    // Filter out the legal hold(s) for this system
    const updatedLegalHolds = currentState.legalHolds.filter(hold => {
      if (hold.system !== system) return true
      if (reason && hold.reason !== reason) return true
      return false
    })

    // Update workflow state
    const updatedState = await this.stateManager.updateWorkflowState(
      workflowId,
      { legalHolds: updatedLegalHolds },
      {
        auditEvent: 'LEGAL_HOLD_REMOVED',
        evidence: { system, reason }
      }
    )

    // Update step status back to NOT_STARTED to allow resumption
    const stepName = `${system}-deletion`
    if (currentState.steps[stepName]?.status === 'LEGAL_HOLD') {
      await this.stateManager.updateStepStatus(
        workflowId,
        stepName,
        'NOT_STARTED',
        { resumedAfterLegalHold: true }
      )
    }

    this.logger.info('Legal hold removed successfully', {
      workflowId,
      system
    })

    return updatedState
  }

  /**
   * Checks if a system is currently under legal hold
   * 
   * Requirement 9.2: Exclude held systems from deletion operations
   */
  async isSystemUnderLegalHold(
    workflowId: string,
    system: string
  ): Promise<LegalHoldStatus> {
    const workflowState = await this.stateManager.getWorkflowState(workflowId)
    if (!workflowState) {
      throw new Error(`Workflow not found: ${workflowId}`)
    }

    const holds = workflowState.legalHolds.filter(hold => hold.system === system)
    
    if (holds.length === 0) {
      return {
        isHeld: false,
        holds: [],
        hasExpired: false
      }
    }

    // Check if any holds have expired
    const now = new Date()
    const activeHolds = holds.filter(hold => {
      if (!hold.expiresAt) return true // No expiration = always active
      return new Date(hold.expiresAt) > now
    })

    return {
      isHeld: activeHolds.length > 0,
      holds: activeHolds,
      hasExpired: activeHolds.length < holds.length
    }
  }

  /**
   * Gets all systems under legal hold for a workflow
   * 
   * Requirement 9.3: List exempted systems with legal justification
   */
  async getSystemsUnderLegalHold(workflowId: string): Promise<{
    system: string
    holds: LegalHold[]
    isActive: boolean
  }[]> {
    const workflowState = await this.stateManager.getWorkflowState(workflowId)
    if (!workflowState) {
      throw new Error(`Workflow not found: ${workflowId}`)
    }

    // Group holds by system
    const holdsBySystem = new Map<string, LegalHold[]>()
    for (const hold of workflowState.legalHolds) {
      if (!holdsBySystem.has(hold.system)) {
        holdsBySystem.set(hold.system, [])
      }
      holdsBySystem.get(hold.system)!.push(hold)
    }

    // Check which systems have active holds
    const now = new Date()
    const result: { system: string; holds: LegalHold[]; isActive: boolean }[] = []

    for (const [system, holds] of holdsBySystem.entries()) {
      const activeHolds = holds.filter(hold => {
        if (!hold.expiresAt) return true
        return new Date(hold.expiresAt) > now
      })

      result.push({
        system,
        holds,
        isActive: activeHolds.length > 0
      })
    }

    return result
  }

  /**
   * Removes all expired legal holds from a workflow
   * 
   * Requirement 9.5: Allow resuming deletion operations when legal holds expire
   */
  async removeExpiredLegalHolds(workflowId: string): Promise<{
    removed: LegalHold[]
    remaining: LegalHold[]
  }> {
    this.logger.info('Checking for expired legal holds', { workflowId })

    const workflowState = await this.stateManager.getWorkflowState(workflowId)
    if (!workflowState) {
      throw new Error(`Workflow not found: ${workflowId}`)
    }

    const now = new Date()
    const expired: LegalHold[] = []
    const remaining: LegalHold[] = []

    for (const hold of workflowState.legalHolds) {
      if (hold.expiresAt && new Date(hold.expiresAt) <= now) {
        expired.push(hold)
      } else {
        remaining.push(hold)
      }
    }

    if (expired.length > 0) {
      // Update workflow state to remove expired holds
      await this.stateManager.updateWorkflowState(
        workflowId,
        { legalHolds: remaining },
        {
          auditEvent: 'EXPIRED_LEGAL_HOLDS_REMOVED',
          evidence: { expired: expired.map(h => ({ system: h.system, reason: h.reason })) }
        }
      )

      // Update step statuses for systems with expired holds
      for (const hold of expired) {
        const stepName = `${hold.system}-deletion`
        if (workflowState.steps[stepName]?.status === 'LEGAL_HOLD') {
          await this.stateManager.updateStepStatus(
            workflowId,
            stepName,
            'NOT_STARTED',
            { resumedAfterExpiration: true }
          )
        }
      }

      this.logger.info('Expired legal holds removed', {
        workflowId,
        expiredCount: expired.length,
        systems: expired.map(h => h.system)
      })
    }

    return { removed: expired, remaining }
  }

  /**
   * Validates if a deletion operation can proceed for a system
   * 
   * Requirement 9.2: Exclude held systems from deletion operations
   */
  async canProceedWithDeletion(
    workflowId: string,
    system: string
  ): Promise<{ canProceed: boolean; reason?: string }> {
    const status = await this.isSystemUnderLegalHold(workflowId, system)

    if (status.isHeld) {
      const reasons = status.holds.map(h => h.reason).join(', ')
      return {
        canProceed: false,
        reason: `System under legal hold: ${reasons}`
      }
    }

    return { canProceed: true }
  }
}
