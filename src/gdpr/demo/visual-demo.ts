/**
 * Visual Demo Runner for GhostProtocol
 * 
 * Provides a visual, step-by-step demonstration of the complete
 * erasure workflow with real-time progress indicators
 */

import { demoUsers } from './sample-users.js'
import { 
  WorkflowPhase, 
  calculateWorkflowProgress,
  generateWorkflowSummary,
  type CompleteWorkflowState 
} from '../integration/workflow-integration.js'

/**
 * Visual progress bar
 */
function renderProgressBar(percentage: number, width: number = 50): string {
  const filled = Math.round((percentage / 100) * width)
  const empty = width - filled
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage}%`
}

/**
 * Visual step status
 */
function renderStepStatus(status: string): string {
  const icons = {
    'NOT_STARTED': '⚪',
    'IN_PROGRESS': '🔵',
    'DELETED': '✅',
    'FAILED': '❌',
    'LEGAL_HOLD': '⚠️'
  }
  return icons[status] || '❓'
}

/**
 * Visual phase indicator
 */
function renderPhaseIndicator(phase: WorkflowPhase): string {
  const icons = {
    [WorkflowPhase.INITIALIZATION]: '🚀',
    [WorkflowPhase.IDENTITY_CRITICAL]: '🔐',
    [WorkflowPhase.CHECKPOINT_VALIDATION]: '✓',
    [WorkflowPhase.PARALLEL_DELETION]: '🔄',
    [WorkflowPhase.PII_SCANNING]: '🤖',
    [WorkflowPhase.BACKGROUND_SCANNING]: '📦',
    [WorkflowPhase.COMPLETION]: '🎉',
    [WorkflowPhase.CERTIFICATE_GENERATION]: '📜'
  }
  return icons[phase] || '❓'
}

/**
 * Create initial workflow state for demo
 */
function createDemoWorkflowState(user: any): CompleteWorkflowState {
  const workflowId = `wf_demo_${Date.now()}`
  const requestId = `req_demo_${Date.now()}`
  const timestamp = new Date().toISOString()

  return {
    workflowId,
    requestId,
    currentPhase: WorkflowPhase.INITIALIZATION,
    status: 'IN_PROGRESS',
    phases: {
      [WorkflowPhase.INITIALIZATION]: {
        startedAt: timestamp,
        status: 'IN_PROGRESS'
      }
    },
    steps: {
      'stripe-deletion': {
        status: 'NOT_STARTED',
        attempts: 0,
        evidence: { timestamp }
      },
      'database-deletion': {
        status: 'NOT_STARTED',
        attempts: 0,
        evidence: { timestamp }
      },
      'checkpoint-validation': {
        status: 'NOT_STARTED',
        attempts: 0,
        evidence: { timestamp }
      },
      'intercom-deletion': {
        status: 'NOT_STARTED',
        attempts: 0,
        evidence: { timestamp }
      },
      'sendgrid-deletion': {
        status: 'NOT_STARTED',
        attempts: 0,
        evidence: { timestamp }
      },
      'crm-deletion': {
        status: 'NOT_STARTED',
        attempts: 0,
        evidence: { timestamp }
      },
      'analytics-deletion': {
        status: 'NOT_STARTED',
        attempts: 0,
        evidence: { timestamp }
      }
    },
    backgroundJobs: {},
    piiFindings: {},
    legalHolds: [],
    auditHashes: [],
    dataLineageSnapshot: {
      systems: ['stripe', 'database', 'intercom', 'sendgrid', 'crm', 'analytics'],
      identifiers: [
        user.identifiers.userId,
        ...user.identifiers.emails,
        ...user.identifiers.phones
      ],
      capturedAt: timestamp
    },
    createdAt: timestamp,
    lastUpdated: timestamp
  }
}

/**
 * Render workflow state visually
 */
function renderWorkflowState(state: CompleteWorkflowState): void {
  console.clear()
  console.log('\n' + '='.repeat(80))
  console.log('GHOSTPROTOCOL - LIVE WORKFLOW VISUALIZATION')
  console.log('='.repeat(80))
  
  // Header
  console.log(`\nWorkflow ID: ${state.workflowId}`)
  console.log(`Status: ${state.status}`)
  console.log(`Current Phase: ${renderPhaseIndicator(state.currentPhase)} ${state.currentPhase}`)
  
  // Progress bar
  const progress = calculateWorkflowProgress(state)
  console.log(`\nProgress: ${renderProgressBar(progress)}`)
  
  // Phase timeline
  console.log('\n' + '-'.repeat(80))
  console.log('PHASE TIMELINE')
  console.log('-'.repeat(80))
  
  const phases = Object.values(WorkflowPhase)
  phases.forEach(phase => {
    const phaseData = state.phases[phase]
    const icon = renderPhaseIndicator(phase)
    const status = phaseData?.status || 'NOT_STARTED'
    const statusIcon = renderStepStatus(status)
    const isCurrent = phase === state.currentPhase ? ' ← CURRENT' : ''
    console.log(`${icon} ${phase.padEnd(30)} ${statusIcon} ${status}${isCurrent}`)
  })
  
  // Steps detail
  console.log('\n' + '-'.repeat(80))
  console.log('DELETION STEPS')
  console.log('-'.repeat(80))
  
  // Identity-critical steps
  console.log('\n🔐 Identity-Critical (Sequential):')
  const criticalSteps = ['stripe-deletion', 'database-deletion', 'checkpoint-validation']
  criticalSteps.forEach(stepName => {
    const step = state.steps[stepName]
    if (step) {
      const icon = renderStepStatus(step.status)
      const attempts = step.attempts > 0 ? ` (${step.attempts} attempts)` : ''
      console.log(`  ${icon} ${stepName.padEnd(30)} ${step.status}${attempts}`)
      if (step.evidence.receipt) {
        console.log(`     └─ Receipt: ${step.evidence.receipt}`)
      }
    }
  })
  
  // Parallel steps
  console.log('\n🔄 Parallel Deletion:')
  const parallelSteps = ['intercom-deletion', 'sendgrid-deletion', 'crm-deletion', 'analytics-deletion']
  parallelSteps.forEach(stepName => {
    const step = state.steps[stepName]
    if (step) {
      const icon = renderStepStatus(step.status)
      const attempts = step.attempts > 0 ? ` (${step.attempts} attempts)` : ''
      console.log(`  ${icon} ${stepName.padEnd(30)} ${step.status}${attempts}`)
      if (step.evidence.receipt) {
        console.log(`     └─ Receipt: ${step.evidence.receipt}`)
      }
    }
  })
  
  // Background jobs
  if (Object.keys(state.backgroundJobs).length > 0) {
    console.log('\n📦 Background Jobs:')
    Object.entries(state.backgroundJobs).forEach(([jobId, job]) => {
      const icon = renderStepStatus(job.status)
      console.log(`  ${icon} ${job.type.padEnd(30)} ${job.status} (${job.progress}%)`)
    })
  }
  
  // PII findings
  if (Object.keys(state.piiFindings).length > 0) {
    console.log('\n🤖 PII Findings:')
    Object.entries(state.piiFindings).forEach(([findingId, finding]) => {
      const actionIcon = finding.action === 'AUTO_DELETE' ? '🗑️' : finding.action === 'MANUAL_REVIEW' ? '📋' : '⏭️'
      console.log(`  ${actionIcon} ${finding.piiType.padEnd(15)} confidence: ${finding.confidence.toFixed(2)} → ${finding.action}`)
    })
  }
  
  // Legal holds
  if (state.legalHolds.length > 0) {
    console.log('\n⚠️  Legal Holds:')
    state.legalHolds.forEach(hold => {
      console.log(`  - ${hold.system}: ${hold.reason}`)
    })
  }
  
  console.log('\n' + '='.repeat(80) + '\n')
}

/**
 * Simulate step execution with visual feedback
 */
async function executeStep(
  state: CompleteWorkflowState,
  stepName: string,
  duration: number,
  shouldFail: boolean = false
): Promise<void> {
  const step = state.steps[stepName]
  if (!step) return
  
  // Mark as in progress
  step.status = 'IN_PROGRESS'
  step.attempts += 1
  state.lastUpdated = new Date().toISOString()
  renderWorkflowState(state)
  
  // Simulate processing
  await new Promise(resolve => setTimeout(resolve, duration))
  
  // Mark as complete or failed
  if (shouldFail && step.attempts < 2) {
    step.status = 'FAILED'
    state.lastUpdated = new Date().toISOString()
    renderWorkflowState(state)
    
    // Retry after delay
    await new Promise(resolve => setTimeout(resolve, 500))
    await executeStep(state, stepName, duration, false) // Succeed on retry
  } else {
    step.status = 'DELETED'
    step.evidence.receipt = `receipt_${stepName}_${Date.now()}`
    step.evidence.timestamp = new Date().toISOString()
    state.lastUpdated = new Date().toISOString()
    renderWorkflowState(state)
  }
}

/**
 * Run complete visual demo
 */
export async function runVisualDemo(): Promise<void> {
  console.log('\n' + '='.repeat(80))
  console.log('STARTING GHOSTPROTOCOL VISUAL DEMO')
  console.log('='.repeat(80))
  console.log('\nPress Ctrl+C to exit at any time\n')
  
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Use Alice Johnson for demo
  const user = demoUsers[0]
  const state = createDemoWorkflowState(user)
  
  // Phase 1: Initialization
  console.log('🚀 Phase 1: Initialization')
  state.currentPhase = WorkflowPhase.INITIALIZATION
  state.phases[WorkflowPhase.INITIALIZATION] = {
    startedAt: new Date().toISOString(),
    status: 'IN_PROGRESS'
  }
  renderWorkflowState(state)
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  state.phases[WorkflowPhase.INITIALIZATION]!.status = 'COMPLETED'
  state.phases[WorkflowPhase.INITIALIZATION]!.completedAt = new Date().toISOString()
  
  // Phase 2: Identity-Critical
  console.log('🔐 Phase 2: Identity-Critical Deletion')
  state.currentPhase = WorkflowPhase.IDENTITY_CRITICAL
  state.phases[WorkflowPhase.IDENTITY_CRITICAL] = {
    startedAt: new Date().toISOString(),
    status: 'IN_PROGRESS'
  }
  renderWorkflowState(state)
  await new Promise(resolve => setTimeout(resolve, 500))
  
  // Execute Stripe deletion
  await executeStep(state, 'stripe-deletion', 2000)
  await new Promise(resolve => setTimeout(resolve, 500))
  
  // Execute Database deletion
  await executeStep(state, 'database-deletion', 1500)
  await new Promise(resolve => setTimeout(resolve, 500))
  
  state.phases[WorkflowPhase.IDENTITY_CRITICAL]!.status = 'COMPLETED'
  state.phases[WorkflowPhase.IDENTITY_CRITICAL]!.completedAt = new Date().toISOString()
  
  // Phase 3: Checkpoint Validation
  console.log('✓ Phase 3: Checkpoint Validation')
  state.currentPhase = WorkflowPhase.CHECKPOINT_VALIDATION
  state.phases[WorkflowPhase.CHECKPOINT_VALIDATION] = {
    startedAt: new Date().toISOString(),
    status: 'IN_PROGRESS'
  }
  renderWorkflowState(state)
  
  await executeStep(state, 'checkpoint-validation', 500)
  
  state.phases[WorkflowPhase.CHECKPOINT_VALIDATION]!.status = 'COMPLETED'
  state.phases[WorkflowPhase.CHECKPOINT_VALIDATION]!.completedAt = new Date().toISOString()
  
  // Phase 4: Parallel Deletion
  console.log('🔄 Phase 4: Parallel Deletion')
  state.currentPhase = WorkflowPhase.PARALLEL_DELETION
  state.phases[WorkflowPhase.PARALLEL_DELETION] = {
    startedAt: new Date().toISOString(),
    status: 'IN_PROGRESS'
  }
  renderWorkflowState(state)
  await new Promise(resolve => setTimeout(resolve, 500))
  
  // Execute parallel deletions (with one failure/retry)
  await Promise.all([
    executeStep(state, 'intercom-deletion', 1000),
    executeStep(state, 'sendgrid-deletion', 1000),
    executeStep(state, 'crm-deletion', 1200, true), // This one will fail and retry
    executeStep(state, 'analytics-deletion', 800)
  ])
  
  state.phases[WorkflowPhase.PARALLEL_DELETION]!.status = 'COMPLETED'
  state.phases[WorkflowPhase.PARALLEL_DELETION]!.completedAt = new Date().toISOString()
  
  // Phase 5: PII Scanning
  console.log('🤖 Phase 5: PII Agent Scanning')
  state.currentPhase = WorkflowPhase.PII_SCANNING
  state.phases[WorkflowPhase.PII_SCANNING] = {
    startedAt: new Date().toISOString(),
    status: 'IN_PROGRESS'
  }
  
  // Add PII findings
  state.piiFindings = {
    'finding_1': {
      matchId: 'match_1',
      system: 'chat-exports',
      location: 'message_123',
      piiType: 'email',
      confidence: 0.92,
      action: 'AUTO_DELETE'
    },
    'finding_2': {
      matchId: 'match_2',
      system: 'chat-exports',
      location: 'message_456',
      piiType: 'email',
      confidence: 0.85,
      action: 'AUTO_DELETE'
    },
    'finding_3': {
      matchId: 'match_3',
      system: 'chat-exports',
      location: 'message_789',
      piiType: 'phone',
      confidence: 0.78,
      action: 'MANUAL_REVIEW'
    }
  }
  
  renderWorkflowState(state)
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  state.phases[WorkflowPhase.PII_SCANNING]!.status = 'COMPLETED'
  state.phases[WorkflowPhase.PII_SCANNING]!.completedAt = new Date().toISOString()
  
  // Phase 6: Background Scanning
  console.log('📦 Phase 6: Background Job Scanning')
  state.currentPhase = WorkflowPhase.BACKGROUND_SCANNING
  state.phases[WorkflowPhase.BACKGROUND_SCANNING] = {
    startedAt: new Date().toISOString(),
    status: 'IN_PROGRESS'
  }
  
  // Add background job
  const jobId = `job_${Date.now()}`
  state.backgroundJobs[jobId] = {
    jobId,
    type: 'S3_SCAN',
    status: 'RUNNING',
    progress: 0,
    checkpoints: [],
    findings: []
  }
  
  // Simulate progress
  for (let progress = 0; progress <= 100; progress += 20) {
    state.backgroundJobs[jobId].progress = progress
    renderWorkflowState(state)
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  
  state.backgroundJobs[jobId].status = 'COMPLETED'
  state.phases[WorkflowPhase.BACKGROUND_SCANNING]!.status = 'COMPLETED'
  state.phases[WorkflowPhase.BACKGROUND_SCANNING]!.completedAt = new Date().toISOString()
  renderWorkflowState(state)
  
  // Phase 7: Completion
  console.log('🎉 Phase 7: Workflow Completion')
  state.currentPhase = WorkflowPhase.COMPLETION
  state.phases[WorkflowPhase.COMPLETION] = {
    startedAt: new Date().toISOString(),
    status: 'IN_PROGRESS'
  }
  state.status = 'COMPLETED'
  state.completedAt = new Date().toISOString()
  renderWorkflowState(state)
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  state.phases[WorkflowPhase.COMPLETION]!.status = 'COMPLETED'
  state.phases[WorkflowPhase.COMPLETION]!.completedAt = new Date().toISOString()
  
  // Phase 8: Certificate Generation
  console.log('📜 Phase 8: Certificate Generation')
  state.currentPhase = WorkflowPhase.CERTIFICATE_GENERATION
  state.phases[WorkflowPhase.CERTIFICATE_GENERATION] = {
    startedAt: new Date().toISOString(),
    status: 'IN_PROGRESS'
  }
  state.certificateId = `cert_${Date.now()}`
  renderWorkflowState(state)
  await new Promise(resolve => setTimeout(resolve, 1500))
  
  state.phases[WorkflowPhase.CERTIFICATE_GENERATION]!.status = 'COMPLETED'
  state.phases[WorkflowPhase.CERTIFICATE_GENERATION]!.completedAt = new Date().toISOString()
  renderWorkflowState(state)
  
  // Final summary
  console.log('\n' + '='.repeat(80))
  console.log('✅ DEMO COMPLETED SUCCESSFULLY')
  console.log('='.repeat(80))
  console.log('\nWorkflow Summary:')
  console.log(generateWorkflowSummary(state))
  console.log('\nCertificate ID:', state.certificateId)
  console.log('Audit Hash Root:', state.auditHashes[state.auditHashes.length - 1] || 'N/A')
  console.log('\n' + '='.repeat(80) + '\n')
}

// CLI support
if (import.meta.url === `file://${process.argv[1]}`) {
  await runVisualDemo()
}
