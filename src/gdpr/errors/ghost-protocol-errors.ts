import { BaseError } from './base-error.js'

/**
 * Base error class for all GhostProtocol-specific errors
 */
export class GhostProtocolError extends BaseError {
  constructor(
    message: string,
    status: number = 500,
    code: string = 'GHOST_PROTOCOL_ERROR',
    metadata: Record<string, any> = {}
  ) {
    super(message, status, code, metadata)
  }
}

/**
 * Error thrown when attempting to create concurrent workflows for the same user
 */
export class WorkflowLockError extends GhostProtocolError {
  constructor(userId: string, existingWorkflowId?: string) {
    super(
      'Concurrent workflow detected for user',
      409,
      'WORKFLOW_LOCK_ERROR',
      { userId, existingWorkflowId }
    )
  }
}

/**
 * Error thrown when a system is under legal hold and cannot be deleted
 */
export class LegalHoldError extends GhostProtocolError {
  constructor(system: string, reason: string, holdId?: string) {
    super(
      `System under legal hold: ${system}`,
      403,
      'LEGAL_HOLD_ERROR',
      { system, reason, holdId }
    )
  }
}

/**
 * Error thrown when identity validation fails
 */
export class IdentityValidationError extends GhostProtocolError {
  constructor(reason: string, providedIdentifiers?: any) {
    super(
      `Identity validation failed: ${reason}`,
      400,
      'IDENTITY_VALIDATION_ERROR',
      { reason, providedIdentifiers }
    )
  }
}

/**
 * Error thrown when workflow state is invalid or corrupted
 */
export class WorkflowStateError extends GhostProtocolError {
  constructor(workflowId: string, reason: string, currentState?: any) {
    super(
      `Workflow state error: ${reason}`,
      500,
      'WORKFLOW_STATE_ERROR',
      { workflowId, reason, currentState }
    )
  }
}

/**
 * Error thrown when external system integration fails
 */
export class ExternalSystemError extends GhostProtocolError {
  constructor(system: string, operation: string, originalError?: any) {
    super(
      `External system error: ${system} ${operation} failed`,
      502,
      'EXTERNAL_SYSTEM_ERROR',
      { system, operation, originalError: originalError?.message }
    )
  }
}

/**
 * Error thrown when audit trail integrity is compromised
 */
export class AuditIntegrityError extends GhostProtocolError {
  constructor(reason: string, auditData?: any) {
    super(
      `Audit integrity compromised: ${reason}`,
      500,
      'AUDIT_INTEGRITY_ERROR',
      { reason, auditData }
    )
  }
}

/**
 * Error thrown when certificate generation fails
 */
export class CertificateGenerationError extends GhostProtocolError {
  constructor(workflowId: string, reason: string) {
    super(
      `Certificate generation failed: ${reason}`,
      500,
      'CERTIFICATE_GENERATION_ERROR',
      { workflowId, reason }
    )
  }
}

/**
 * Error thrown when PII agent processing fails
 */
export class PIIAgentError extends GhostProtocolError {
  constructor(operation: string, reason: string, inputData?: any) {
    super(
      `PII agent error: ${operation} - ${reason}`,
      500,
      'PII_AGENT_ERROR',
      { operation, reason, inputData }
    )
  }
}

/**
 * Error thrown when background job fails
 */
export class BackgroundJobError extends GhostProtocolError {
  constructor(jobId: string, jobType: string, reason: string) {
    super(
      `Background job failed: ${jobType} - ${reason}`,
      500,
      'BACKGROUND_JOB_ERROR',
      { jobId, jobType, reason }
    )
  }
}

/**
 * Error thrown when policy configuration is invalid
 */
export class PolicyConfigError extends GhostProtocolError {
  constructor(policyVersion: string, reason: string) {
    super(
      `Policy configuration error: ${reason}`,
      400,
      'POLICY_CONFIG_ERROR',
      { policyVersion, reason }
    )
  }
}