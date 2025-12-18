/**
 * Service exports for GhostProtocol
 */
export { WorkflowStateManager } from './workflow-state-manager.js'
export type { 
  WorkflowCreationOptions, 
  WorkflowLock, 
  RequestHashEntry, 
  StateUpdateOptions 
} from './workflow-state-manager.js'

export { PIIAgent, piiAgent } from './pii-agent.js'
export type {
  PIIAgentInput,
  PIIAgentOutput,
  PIIAgentAuditEntry
} from './pii-agent.js'

export { BackgroundJobManager, backgroundJobManager } from './background-job-manager.js'
export type {
  BackgroundJobCreationOptions,
  JobCheckpoint,
  JobProgressUpdate
} from './background-job-manager.js'

export { AuditTrail } from './audit-trail.js'
export type {
  AuditEvent,
  AuditEntry,
  AuditTrailState
} from './audit-trail.js'

export { CertificateGenerator } from './certificate-generator.js'
export type {
  CertificateGenerationOptions
} from './certificate-generator.js'

export { MonitoringStreamManager } from './monitoring-stream-manager.js'
export type {
  StreamContext,
  ProgressInfo,
  ErrorContext,
  RemediationInfo,
  ErrorImpact
} from './monitoring-stream-manager.js'

export { ZombieCheckScheduler } from './zombie-check-scheduler.js'
export type {
  ZombieCheckSchedule
} from './zombie-check-scheduler.js'

export { LegalHoldManager } from './legal-hold-manager.js'
export type {
  LegalHoldOptions,
  LegalHoldStatus
} from './legal-hold-manager.js'