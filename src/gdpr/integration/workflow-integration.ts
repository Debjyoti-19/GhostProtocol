/**
 * Complete End-to-End Workflow Integration
 * 
 * This file wires together all GhostProtocol components for complete
 * erasure request lifecycle from API to certificate generation.
 * 
 * Requirements: All
 */

import { v4 as uuidv4 } from 'uuid'

/**
 * Complete workflow execution flow
 * 
 * 1. API receives erasure request
 * 2. Identity-critical orchestrator triggers
 * 3. Sequential deletion (Stripe → Database)
 * 4. Checkpoint validation
 * 5. Parallel deletion orchestrator triggers
 * 6. Non-critical systems delete in parallel
 * 7. PII agent scans unstructured data
 * 8. Background jobs scan cold storage
 * 9. Workflow completion handler
 * 10. Certificate generation
 * 11. Real-time UI updates throughout
 * 12. Zombie check scheduled for 30 days later
 */

export interface WorkflowIntegrationConfig {
  enablePIIAgent: boolean
  enableBackgroundJobs: boolean
  enableZombieChecks: boolean
  enableRealTimeStreaming: boolean
  policyVersion: string
}

export const defaultConfig: WorkflowIntegrationConfig = {
  enablePIIAgent: true,
  enableBackgroundJobs: true,
  enableZombieChecks: true,
  enableRealTimeStreaming: true,
  policyVersion: '1.0.0'
}

/**
 * Workflow execution phases
 */
export enum WorkflowPhase {
  INITIALIZATION = 'initialization',
  IDENTITY_CRITICAL = 'identity-critical',
  CHECKPOINT_VALIDATION = 'checkpoint-validation',
  PARALLEL_DELETION = 'parallel-deletion',
  PII_SCANNING = 'pii-scanning',
  BACKGROUND_SCANNING = 'background-scanning',
  COMPLETION = 'completion',
  CERTIFICATE_GENERATION = 'certificate-generation'
}

/**
 * Complete workflow state tracking
 */
export interface CompleteWorkflowState {
  workflowId: string
  requestId: string
  currentPhase: WorkflowPhase
  status: 'IN_PROGRESS' | 'COMPLETED' | 'COMPLETED_WITH_EXCEPTIONS' | 'FAILED'
  
  // Phase tracking
  phases: {
    [key in WorkflowPhase]?: {
      startedAt: string
      completedAt?: string
      status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
      errors?: string[]
    }
  }
  
  // Step tracking
  steps: {
    [stepName: string]: {
      status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DELETED' | 'FAILED' | 'LEGAL_HOLD'
      attempts: number
      evidence: {
        receipt?: string
        timestamp: string
        apiResponse?: any
      }
    }
  }
  
  // Background jobs
  backgroundJobs: {
    [jobId: string]: {
      jobId: string
      type: 'S3_SCAN' | 'WAREHOUSE_SCAN' | 'BACKUP_CHECK'
      status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
      progress: number
      checkpoints: string[]
      findings: any[]
    }
  }
  
  // PII findings
  piiFindings: {
    [findingId: string]: {
      matchId: string
      system: string
      location: string
      piiType: string
      confidence: number
      action: 'AUTO_DELETE' | 'MANUAL_REVIEW' | 'IGNORED'
    }
  }
  
  // Legal holds
  legalHolds: {
    system: string
    reason: string
    expiresAt?: string
  }[]
  
  // Audit trail
  auditHashes: string[]
  
  // Data lineage
  dataLineageSnapshot: {
    systems: string[]
    identifiers: string[]
    capturedAt: string
  }
  
  // Timestamps
  createdAt: string
  lastUpdated: string
  completedAt?: string
  
  // Certificate
  certificateId?: string
}

/**
 * Event flow mapping
 * 
 * This defines the complete event chain for the workflow
 */
export const eventFlowMap = {
  // API triggers workflow creation
  'erasure-request-created': ['workflow-created'],
  
  // Workflow creation triggers identity-critical orchestrator
  'workflow-created': ['identity-critical-orchestrator'],
  
  // Identity-critical orchestrator triggers Stripe deletion
  'identity-critical-orchestrator': ['stripe-deletion'],
  
  // Stripe deletion success triggers database deletion
  'stripe-deletion-success': ['database-deletion'],
  
  // Database deletion success triggers checkpoint validation
  'database-deletion-success': ['checkpoint-validation'],
  
  // Checkpoint validation triggers parallel orchestrator
  'checkpoint-validation-success': ['parallel-deletion-orchestrator'],
  
  // Parallel orchestrator triggers all non-critical deletions
  'parallel-deletion-orchestrator': [
    'intercom-deletion',
    'sendgrid-deletion',
    'crm-deletion',
    'analytics-deletion'
  ],
  
  // All parallel deletions complete triggers PII scanning (if enabled)
  'parallel-deletion-complete': ['pii-agent-scan'],
  
  // PII scanning complete triggers background jobs (if enabled)
  'pii-agent-scan-complete': ['background-job-orchestrator'],
  
  // Background jobs complete triggers workflow completion
  'background-jobs-complete': ['workflow-completion'],
  
  // Workflow completion triggers certificate generation
  'workflow-completion': ['certificate-generation'],
  
  // Certificate generation triggers zombie check scheduling
  'certificate-generation-complete': ['zombie-check-scheduler']
}

/**
 * Step dependencies
 * 
 * Defines which steps must complete before others can start
 */
export const stepDependencies = {
  'database-deletion': ['stripe-deletion'],
  'checkpoint-validation': ['stripe-deletion', 'database-deletion'],
  'intercom-deletion': ['checkpoint-validation'],
  'sendgrid-deletion': ['checkpoint-validation'],
  'crm-deletion': ['checkpoint-validation'],
  'analytics-deletion': ['checkpoint-validation'],
  'pii-agent-scan': ['intercom-deletion', 'sendgrid-deletion', 'crm-deletion', 'analytics-deletion'],
  'background-job-orchestrator': ['pii-agent-scan'],
  'workflow-completion': ['background-job-orchestrator'],
  'certificate-generation': ['workflow-completion']
}

/**
 * System integration points
 * 
 * Maps systems to their deletion steps and connectors
 */
export const systemIntegrations = {
  stripe: {
    stepName: 'stripe-deletion',
    connector: 'StripeConnector',
    critical: true,
    retryable: true,
    maxRetries: 3
  },
  database: {
    stepName: 'database-deletion',
    connector: 'DatabaseConnector',
    critical: true,
    retryable: true,
    maxRetries: 3
  },
  intercom: {
    stepName: 'intercom-deletion',
    connector: 'IntercomConnector',
    critical: false,
    retryable: true,
    maxRetries: 5
  },
  sendgrid: {
    stepName: 'sendgrid-deletion',
    connector: 'SendGridConnector',
    critical: false,
    retryable: true,
    maxRetries: 5
  },
  crm: {
    stepName: 'crm-deletion',
    connector: 'CRMConnector',
    critical: false,
    retryable: true,
    maxRetries: 5
  },
  analytics: {
    stepName: 'analytics-deletion',
    connector: 'AnalyticsConnector',
    critical: false,
    retryable: true,
    maxRetries: 5
  }
}

/**
 * Real-time streaming topics
 * 
 * Defines which events should be streamed to the UI
 */
export const streamingTopics = {
  'workflow-status': {
    description: 'Live workflow status updates',
    events: [
      'workflow-created',
      'phase-started',
      'phase-completed',
      'step-started',
      'step-completed',
      'step-failed',
      'workflow-completed'
    ]
  },
  'error-notifications': {
    description: 'Error and failure notifications',
    events: [
      'step-failed',
      'retry-attempted',
      'manual-intervention-required',
      'system-unavailable'
    ]
  },
  'completion-notifications': {
    description: 'Workflow completion notifications',
    events: [
      'workflow-completed',
      'certificate-generated',
      'zombie-check-scheduled'
    ]
  }
}

/**
 * Audit event types
 * 
 * All events that should be logged to the audit trail
 */
export const auditEventTypes = [
  'WORKFLOW_CREATED',
  'DUPLICATE_REQUEST_DETECTED',
  'REQUEST_DEDUPLICATED',
  'IDENTITY_CRITICAL_PHASE_STARTED',
  'STRIPE_DELETION_STARTED',
  'STRIPE_DELETION_COMPLETED',
  'STRIPE_DELETION_FAILED',
  'DATABASE_DELETION_STARTED',
  'DATABASE_DELETION_COMPLETED',
  'DATABASE_DELETION_FAILED',
  'CHECKPOINT_VALIDATED',
  'PARALLEL_PHASE_STARTED',
  'SYSTEM_DELETION_STARTED',
  'SYSTEM_DELETION_COMPLETED',
  'SYSTEM_DELETION_FAILED',
  'PII_SCAN_STARTED',
  'PII_FINDING_DETECTED',
  'PII_AUTO_DELETE_SPAWNED',
  'PII_MANUAL_REVIEW_FLAGGED',
  'BACKGROUND_JOB_CREATED',
  'BACKGROUND_JOB_PROGRESS',
  'BACKGROUND_JOB_COMPLETED',
  'WORKFLOW_COMPLETED',
  'CERTIFICATE_GENERATED',
  'CERTIFICATE_DOWNLOADED',
  'ZOMBIE_CHECK_SCHEDULED',
  'ZOMBIE_DATA_DETECTED',
  'LEGAL_HOLD_APPLIED',
  'LEGAL_HOLD_RELEASED',
  'MANUAL_OVERRIDE_APPLIED',
  'STATUS_QUERIED'
]

/**
 * Progress calculation
 * 
 * Calculate overall workflow progress based on completed steps
 */
export function calculateWorkflowProgress(state: CompleteWorkflowState): number {
  const totalSteps = Object.keys(state.steps).length
  if (totalSteps === 0) return 0
  
  const completedSteps = Object.values(state.steps).filter(
    step => step.status === 'DELETED'
  ).length
  
  return Math.round((completedSteps / totalSteps) * 100)
}

/**
 * Determine if workflow can proceed to next phase
 */
export function canProceedToPhase(
  state: CompleteWorkflowState,
  targetPhase: WorkflowPhase
): boolean {
  const dependencies = stepDependencies[targetPhase]
  if (!dependencies) return true
  
  return dependencies.every(dep => {
    const step = state.steps[dep]
    return step && step.status === 'DELETED'
  })
}

/**
 * Get next phase in workflow
 */
export function getNextPhase(currentPhase: WorkflowPhase): WorkflowPhase | null {
  const phases = Object.values(WorkflowPhase)
  const currentIndex = phases.indexOf(currentPhase)
  
  if (currentIndex === -1 || currentIndex === phases.length - 1) {
    return null
  }
  
  return phases[currentIndex + 1]
}

/**
 * Validate workflow state consistency
 */
export function validateWorkflowState(state: CompleteWorkflowState): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []
  
  // Check required fields
  if (!state.workflowId) errors.push('Missing workflowId')
  if (!state.requestId) errors.push('Missing requestId')
  if (!state.currentPhase) errors.push('Missing currentPhase')
  if (!state.status) errors.push('Missing status')
  
  // Check data lineage snapshot
  if (!state.dataLineageSnapshot) {
    errors.push('Missing data lineage snapshot')
  } else {
    if (!state.dataLineageSnapshot.systems || state.dataLineageSnapshot.systems.length === 0) {
      errors.push('Data lineage snapshot missing systems')
    }
    if (!state.dataLineageSnapshot.identifiers || state.dataLineageSnapshot.identifiers.length === 0) {
      errors.push('Data lineage snapshot missing identifiers')
    }
  }
  
  // Check phase consistency
  if (state.currentPhase && !state.phases[state.currentPhase]) {
    errors.push(`Current phase ${state.currentPhase} not tracked in phases object`)
  }
  
  // Check step dependencies
  for (const [stepName, step] of Object.entries(state.steps)) {
    if (step.status === 'DELETED' || step.status === 'IN_PROGRESS') {
      const deps = stepDependencies[stepName]
      if (deps) {
        for (const dep of deps) {
          const depStep = state.steps[dep]
          if (!depStep || depStep.status !== 'DELETED') {
            errors.push(`Step ${stepName} started before dependency ${dep} completed`)
          }
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Generate workflow summary for monitoring
 */
export function generateWorkflowSummary(state: CompleteWorkflowState): string {
  const progress = calculateWorkflowProgress(state)
  const totalSteps = Object.keys(state.steps).length
  const completedSteps = Object.values(state.steps).filter(s => s.status === 'DELETED').length
  const failedSteps = Object.values(state.steps).filter(s => s.status === 'FAILED').length
  
  return `
Workflow: ${state.workflowId}
Status: ${state.status}
Phase: ${state.currentPhase}
Progress: ${progress}% (${completedSteps}/${totalSteps} steps)
Failed: ${failedSteps}
Background Jobs: ${Object.keys(state.backgroundJobs).length}
PII Findings: ${Object.keys(state.piiFindings).length}
Legal Holds: ${state.legalHolds.length}
  `.trim()
}

/**
 * Export integration configuration
 */
export const integrationConfig = {
  eventFlowMap,
  stepDependencies,
  systemIntegrations,
  streamingTopics,
  auditEventTypes,
  defaultConfig
}

/**
 * Integration health check
 */
export function checkIntegrationHealth(): {
  healthy: boolean
  issues: string[]
} {
  const issues: string[] = []
  
  // Check that all systems have corresponding steps
  for (const [system, config] of Object.entries(systemIntegrations)) {
    if (!config.stepName) {
      issues.push(`System ${system} missing stepName`)
    }
    if (!config.connector) {
      issues.push(`System ${system} missing connector`)
    }
  }
  
  // Check that all step dependencies reference valid steps
  for (const [step, deps] of Object.entries(stepDependencies)) {
    for (const dep of deps) {
      const depExists = Object.values(systemIntegrations).some(
        s => s.stepName === dep
      )
      if (!depExists && !['checkpoint-validation', 'pii-agent-scan', 'background-job-orchestrator', 'workflow-completion', 'certificate-generation'].includes(dep)) {
        issues.push(`Step ${step} depends on unknown step ${dep}`)
      }
    }
  }
  
  return {
    healthy: issues.length === 0,
    issues
  }
}
