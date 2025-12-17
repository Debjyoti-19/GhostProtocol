/**
 * Error handling exports for GhostProtocol
 */
export { BaseError } from './base-error.js'
export {
  GhostProtocolError,
  WorkflowLockError,
  LegalHoldError,
  IdentityValidationError,
  WorkflowStateError,
  ExternalSystemError,
  AuditIntegrityError,
  CertificateGenerationError,
  PIIAgentError,
  BackgroundJobError,
  PolicyConfigError
} from './ghost-protocol-errors.js'