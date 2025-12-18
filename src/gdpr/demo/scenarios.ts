/**
 * Demo scenarios for GhostProtocol presentation
 * Each scenario demonstrates different aspects of the system
 */

import { demoUsers, DemoUser } from './sample-users.js'
import { getPolicyByJurisdiction } from './policies.js'

export interface DemoScenario {
  id: string
  name: string
  description: string
  user: DemoUser
  expectedOutcome: string
  demonstratesFeatures: string[]
  estimatedDuration: string
  steps: string[]
}

/**
 * Scenario 1: Happy Path - Complete Erasure
 * Demonstrates the full workflow from request to certificate
 */
export const scenario1_HappyPath: DemoScenario = {
  id: 'scenario_1',
  name: 'Happy Path: Complete EU User Erasure',
  description: 'Alice Johnson (EU user) requests complete data deletion. All systems cooperate, and the workflow completes successfully with a certificate of destruction.',
  user: demoUsers[0], // Alice
  expectedOutcome: 'COMPLETED - Certificate of Destruction generated',
  demonstratesFeatures: [
    'Identity-critical sequential deletion (Stripe → Database)',
    'Parallel non-critical deletion (Intercom, SendGrid, CRM)',
    'Real-time UI updates',
    'Certificate generation with signed evidence',
    'EU GDPR policy application',
    'Audit trail with hash chains'
  ],
  estimatedDuration: '60 seconds',
  steps: [
    '1. Submit erasure request via API with Alice\'s identifiers',
    '2. Watch workflow create and acquire user lock',
    '3. Observe Stripe deletion (identity-critical step 1)',
    '4. Observe Database deletion (identity-critical step 2)',
    '5. See "identity: GONE" checkpoint marked',
    '6. Watch parallel deletion steps spawn (Intercom, SendGrid, CRM, Analytics)',
    '7. Monitor real-time progress in admin UI',
    '8. View completion and certificate generation',
    '9. Download Certificate of Destruction with all evidence'
  ]
}

/**
 * Scenario 2: Partial Completion with Exceptions
 * Demonstrates handling of third-party system failures
 */
export const scenario2_PartialCompletion: DemoScenario = {
  id: 'scenario_2',
  name: 'Partial Completion: Third-Party System Failure',
  description: 'Bob Smith\'s erasure request encounters a failure in the CRM system. The workflow completes with exceptions, documenting the failure.',
  user: demoUsers[1], // Bob
  expectedOutcome: 'COMPLETED_WITH_EXCEPTIONS - Certificate lists unresolved systems',
  demonstratesFeatures: [
    'Retry logic with exponential backoff',
    'Graceful failure handling',
    'COMPLETED_WITH_EXCEPTIONS state',
    'Certificate with exception documentation',
    'Remediation guidance',
    'Audit clarity for partial success'
  ],
  estimatedDuration: '45 seconds',
  steps: [
    '1. Submit erasure request for Bob',
    '2. Watch identity-critical steps complete successfully',
    '3. Observe parallel steps begin',
    '4. See CRM deletion fail after retries',
    '5. Watch workflow continue with other systems',
    '6. View final state: COMPLETED_WITH_EXCEPTIONS',
    '7. Examine certificate showing successful deletions and CRM exception',
    '8. Review remediation guidance for manual CRM cleanup'
  ]
}

/**
 * Scenario 3: PII Agent Detection
 * Demonstrates AI-powered PII detection in unstructured data
 */
export const scenario3_PIIDetection: DemoScenario = {
  id: 'scenario_3',
  name: 'PII Agent: Unstructured Data Scanning',
  description: 'Carol Williams has extensive chat history. The PII Agent scans Slack exports and Intercom conversations to find hidden PII.',
  user: demoUsers[2], // Carol
  expectedOutcome: 'PII detected in 15+ messages, automatic deletion spawned',
  demonstratesFeatures: [
    'PII Agent pre-filtering with regex',
    'Confidence scoring (0.0-1.0)',
    'Automatic deletion for high confidence (≥0.8)',
    'Manual review flagging for medium confidence (0.5-0.8)',
    'Structured PII findings output',
    'Audit logging with data minimization'
  ],
  estimatedDuration: '30 seconds',
  steps: [
    '1. Submit erasure request for Carol',
    '2. Watch PII Agent scan chat exports',
    '3. See pre-filtering identify emails: carol.williams@example.org, c.williams@work.com, carol@personal.net',
    '4. Observe confidence scores for each finding',
    '5. Watch automatic deletion spawn for high-confidence matches',
    '6. See manual review flags for medium-confidence matches',
    '7. Review structured PII findings in audit trail',
    '8. Verify data minimization (references, not raw content)'
  ]
}

/**
 * Scenario 4: Background Job Scanning
 * Demonstrates resumable background jobs for cold storage
 */
export const scenario4_BackgroundScanning: DemoScenario = {
  id: 'scenario_4',
  name: 'Background Jobs: S3 Cold Storage Scanning',
  description: 'David Chen\'s data exists in S3 backups. Background jobs scan cold storage, find PII, and spawn deletion steps.',
  user: demoUsers[3], // David
  expectedOutcome: 'Background jobs complete, PII found in 3 backup files',
  demonstratesFeatures: [
    'Resumable background jobs',
    'Checkpoint-based progress tracking',
    'S3/MinIO integration',
    'PII discovery in backups',
    'Automatic deletion step spawning',
    'Progress reporting to workflow state'
  ],
  estimatedDuration: '40 seconds',
  steps: [
    '1. Submit erasure request for David',
    '2. Watch identity-critical and parallel steps complete',
    '3. See background job creation for S3 scanning',
    '4. Monitor progress updates (0% → 100%)',
    '5. Observe checkpoint saves every 1000 items',
    '6. Watch PII discovery in backup files',
    '7. See automatic deletion steps spawn for found PII',
    '8. View job completion and final audit entries'
  ]
}

/**
 * Scenario 5: Zombie Data Detection
 * Demonstrates automated detection of resurrected data
 */
export const scenario5_ZombieDetection: DemoScenario = {
  id: 'scenario_5',
  name: 'Zombie Data: Automated Re-deletion',
  description: 'Henry Brown\'s data was deleted, but a backup restore brings it back. The zombie check detects this and spawns a new erasure workflow.',
  user: demoUsers[7], // Henry (zombie scenario)
  expectedOutcome: 'Zombie data detected, new workflow spawned automatically',
  demonstratesFeatures: [
    'Cron-based zombie checks (30-day interval)',
    'Re-scanning of critical systems',
    'Automatic new workflow spawning',
    'Legal team alerts',
    'Audit trail of zombie detection',
    'Compliance maintenance'
  ],
  estimatedDuration: '35 seconds',
  steps: [
    '1. Show completed erasure workflow for Henry (30+ days ago)',
    '2. Simulate backup restore that resurrects Henry\'s data',
    '3. Trigger zombie check cron job',
    '4. Watch system re-scan for Henry\'s identifiers',
    '5. See zombie data detection in database',
    '6. Observe automatic new erasure workflow creation',
    '7. View legal team alert notification',
    '8. Review audit trail showing zombie detection and response'
  ]
}

/**
 * Scenario 6: Legal Hold
 * Demonstrates legal hold functionality
 */
export const scenario6_LegalHold: DemoScenario = {
  id: 'scenario_6',
  name: 'Legal Hold: Selective Data Preservation',
  description: 'Frank Mueller requests erasure, but his financial records are under legal hold due to an audit. The system preserves held data while deleting everything else.',
  user: demoUsers[5], // Frank
  expectedOutcome: 'COMPLETED - Certificate lists legal hold exemptions',
  demonstratesFeatures: [
    'Legal hold marking for specific systems',
    'Exclusion of held systems from deletion',
    'Certificate documentation of exemptions',
    'Legal justification recording',
    'Audit trail of hold decisions',
    'Partial deletion with compliance'
  ],
  estimatedDuration: '40 seconds',
  steps: [
    '1. Mark Frank\'s financial records with LEGAL_HOLD status',
    '2. Submit erasure request for Frank',
    '3. Watch workflow skip financial records system',
    '4. See all other systems deleted normally',
    '5. View workflow complete with legal holds',
    '6. Examine certificate listing exempted systems',
    '7. Review legal justification in audit trail',
    '8. Demonstrate hold expiration and resumption capability'
  ]
}

/**
 * Scenario 7: Multi-Jurisdiction Comparison
 * Demonstrates policy-driven workflows for different regions
 */
export const scenario7_PolicyComparison: DemoScenario = {
  id: 'scenario_7',
  name: 'Policy Comparison: EU vs US vs Other',
  description: 'Compare how the same erasure request is handled differently under EU GDPR, US CCPA, and general policies.',
  user: demoUsers[0], // Use Alice for all three
  expectedOutcome: 'Three workflows with different timelines and thresholds',
  demonstratesFeatures: [
    'Jurisdiction-based policy application',
    'Different deletion timelines',
    'Varying confidence thresholds',
    'Region-specific retention rules',
    'Policy versioning',
    'Audit trail policy references'
  ],
  estimatedDuration: '50 seconds',
  steps: [
    '1. Show EU policy: 30-day zombie check, 0.85 confidence threshold',
    '2. Show US policy: 45-day zombie check, 0.80 confidence threshold',
    '3. Show Other policy: 60-day zombie check, 0.75 confidence threshold',
    '4. Submit same erasure request under each policy',
    '5. Compare deletion timelines side-by-side',
    '6. Observe different PII agent behaviors',
    '7. Review policy version references in certificates',
    '8. Demonstrate policy update and versioning'
  ]
}

/**
 * Scenario 8: Real-time Monitoring
 * Demonstrates the admin UI and streaming capabilities
 */
export const scenario8_RealtimeMonitoring: DemoScenario = {
  id: 'scenario_8',
  name: 'Real-time Monitoring: Admin Dashboard',
  description: 'Monitor multiple concurrent erasure workflows in real-time through the admin UI with live updates.',
  user: demoUsers[2], // Carol (for visual complexity)
  expectedOutcome: 'Live network graph showing all deletion steps and status',
  demonstratesFeatures: [
    'Real-time workflow status streaming',
    'Network graph visualization',
    'Live progress indicators',
    'Error streaming with remediation',
    'Completion notifications',
    'Multi-workflow monitoring'
  ],
  estimatedDuration: '45 seconds',
  steps: [
    '1. Open admin UI dashboard',
    '2. Submit erasure request for Carol',
    '3. Watch network graph populate in real-time',
    '4. See nodes appear for each deletion step',
    '5. Observe status changes (pending → running → completed)',
    '6. View progress percentages update live',
    '7. See error details stream when failures occur',
    '8. Watch completion notification appear'
  ]
}

/**
 * Get all demo scenarios
 */
export const allScenarios: DemoScenario[] = [
  scenario1_HappyPath,
  scenario2_PartialCompletion,
  scenario3_PIIDetection,
  scenario4_BackgroundScanning,
  scenario5_ZombieDetection,
  scenario6_LegalHold,
  scenario7_PolicyComparison,
  scenario8_RealtimeMonitoring
]

/**
 * Get scenario by ID
 */
export function getScenarioById(id: string): DemoScenario | undefined {
  return allScenarios.find(scenario => scenario.id === id)
}

/**
 * Get scenarios that demonstrate a specific feature
 */
export function getScenariosByFeature(feature: string): DemoScenario[] {
  return allScenarios.filter(scenario =>
    scenario.demonstratesFeatures.some(f =>
      f.toLowerCase().includes(feature.toLowerCase())
    )
  )
}

/**
 * Generate a demo script for judges (60-90 seconds)
 */
export function generateJudgeDemoScript(): string {
  return `
# GhostProtocol - 60 Second Judge Demo Script

## Setup (5 seconds)
"GhostProtocol is a durable GDPR/CCPA erasure orchestration engine built on Motia."

## Demo Flow (50 seconds)

### 1. Submit Erasure Request (10 seconds)
- Show API call for Alice Johnson (EU user)
- Display workflow creation with user lock
- Point out data lineage snapshot

### 2. Sequential Identity-Critical Deletion (15 seconds)
- Watch Stripe deletion complete (with retry logic)
- See Database deletion follow
- Highlight "identity: GONE" checkpoint

### 3. Parallel Non-Critical Deletion (10 seconds)
- Show 4 systems deleting in parallel (Intercom, SendGrid, CRM, Analytics)
- Point out real-time UI updates
- Demonstrate retry logic on one failure

### 4. PII Agent in Action (10 seconds)
- Show chat export scan finding hidden PII
- Display confidence scores (0.85, 0.92, 0.78)
- Watch automatic deletion spawn for high-confidence matches

### 5. Certificate Generation (5 seconds)
- Show Certificate of Destruction with:
  - All system receipts
  - Signed hash chain
  - Data lineage snapshot
  - Legal compliance proof

## Closing (5 seconds)
"The workflow survives crashes, handles zombie data, and provides legally defensible proof of deletion."

## Key Points to Emphasize:
✓ Durable workflows that survive server crashes
✓ AI-powered PII detection in unstructured data
✓ Tamper-evident audit trails with hash chains
✓ Policy-driven (EU GDPR vs US CCPA)
✓ Real-time monitoring and streaming
✓ Zombie data detection (30-day checks)
✓ Legal hold support
✓ Partial completion handling
  `.trim()
}

/**
 * Generate a detailed demo walkthrough
 */
export function generateDetailedWalkthrough(): string {
  return allScenarios
    .map((scenario, index) => {
      return `
## Scenario ${index + 1}: ${scenario.name}

**Description:** ${scenario.description}

**User:** ${scenario.user.identifiers.userId} (${scenario.user.jurisdiction})

**Expected Outcome:** ${scenario.expectedOutcome}

**Duration:** ${scenario.estimatedDuration}

**Demonstrates:**
${scenario.demonstratesFeatures.map(f => `- ${f}`).join('\n')}

**Steps:**
${scenario.steps.join('\n')}

---
      `.trim()
    })
    .join('\n\n')
}
