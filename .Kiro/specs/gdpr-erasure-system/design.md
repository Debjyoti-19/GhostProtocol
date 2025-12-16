# GhostProtocol Design Document

## Overview

GhostProtocol is a forward-only, durable orchestration engine built on Motia that systematically handles Right-to-Be-Forgotten requests (GDPR/CCPA) by removing personal data across fragmented SaaS stacks within legal windows with provable evidence. The system uses Motia's native primitives (API Steps, Event Steps, Cron Steps, State Management, Background Jobs, Agents, and Streams) to create a tamper-evident audit trail and ensure legal compliance.

The system addresses critical failure modes including partial completion, irreversible deletions without durable state, hidden PII in unstructured data, long-running operations that outlive processes, and data resurrection from backups.

## Architecture

### High-Level Flow

```
[API Layer] → [Motia Orchestrator] → {Stripe Step, DB Step, Intercom Step, Agent Scan, S3 Job...} 
    ↓
[State Store + Audit Log] → [Real-time Streams] → [Admin UI]
    ↓
[Background Jobs / Workers]
```

### Core Components

1. **API Layer (Front Desk)** - Receives erasure requests, validates legal identity, starts workflows
2. **Motia Orchestrator** - Manages workflows using native Motia primitives
3. **Integration Workers** - Connectors for external systems with idempotent operations
4. **AI Agent Service** - Analyzes unstructured text for PII detection
5. **State Store & Audit Trail** - Tamper-evident state with append-only events
6. **Background Job Runner** - Handles long-running tasks (S3 scans, warehouse deletes)
7. **Streams / Event Bus** - Real-time status updates to UI and audit systems
8. **Cron Scheduler** - Zombie data detection and reconciliation
9. **Admin UI** - Network graph, live logs, certificate export, manual overrides

### Motia Primitive Mapping

| Motia Primitive | Role in GhostProtocol |
|-----------------|----------------------|
| **API Steps** | Entry points for erasure requests, manual overrides, status queries |
| **Event Steps** | Per-system deletion operations (Stripe, DB, Intercom, etc.) |
| **Cron Steps** | Zombie data detection, policy compliance checks |
| **State Management** | Workflow state, evidence storage, user locks |
| **Background Jobs** | Long-running scans (S3, cold storage, data warehouses) |
| **Agents** | PII detection in unstructured data |
| **Streams** | Real-time UI updates, compliance monitoring |

### The GhostProtocol Primitive Map

| Motia Primitive | Human Analogy | Role in GhostProtocol |
| :--- | :--- | :--- |
| **1. Workflow** | **The Project Manager** | The main logic (`ErasureOrchestrator`) that holds the state, enforces the sequence (Stripe → DB), and survives server crashes. |
| **2. Step** | **The Specialist Worker** | Performs the actual risky tasks: `stripe.deleteCustomer()`, `aws.deleteFile()`. If they fail, they retry without bothering the Manager. |
| **3. Sleep** | **The Cryogenic Chamber** | **(The Winning Feature)** Pauses the workflow for **30 days** post-deletion. Wakes up automatically to run the "Zombie Data Check." |
| **4. Signal** | **The Red Phone** | **"Legal Hold."** Allows a lawyer to interrupt a running deletion asynchronously. "Stop everything, we are being sued." |
| **5. Query** | **The Clipboard** | Allows the Frontend UI to ask "What % is deleted?" instantly by checking the Workflow's memory, without hitting the database. |
| **6. Child Workflow** | **The Sub-Contractor** | Isolates failures. `SalesforceDeletion` runs as a child. If Salesforce crashes, it doesn't kill the main Parent workflow. |
| **7. Cron** | **The Night Watchman** | `PolicyUpdater`. Runs every midnight to check for new GDPR legislation and update the global deletion rules. |
| **8. Continue-As-New** | **The Shift Change** | Used by the **S3 Background Scanner**. Instead of one workflow running forever (memory leak), it finishes a batch and starts a fresh copy of itself. |
| **9. Side Effect** | **The Notary** | Generates the unique **Certificate ID**. Ensures that if the workflow replays, it doesn't generate a *new* ID, but remembers the original one. |

## Components and Interfaces

### API Layer

**Primary Endpoints:**
- `POST /erasure-request` - Initiate new erasure workflow
- `GET /erasure-request/:id/status` - Query workflow status
- `POST /erasure-request/:id/override` - Manual legal overrides
- `GET /erasure-request/:id/certificate` - Download certificate of destruction

**Authentication & Authorization:**
- JWT-based authentication for compliance officers
- Role-based access control (Legal, Compliance Admin, Auditor)
- Request signing for legal proof validation

### Workflow Engine (Motia Event Steps)

**Sequential Identity-Critical Steps:**
1. **Stripe Deletion Step** - Cancel subscriptions, delete customer data
2. **Database Deletion Step** - Remove/anonymize user records
3. **Checkpoint Validation** - Verify identity-critical deletions complete

**Parallel Non-Critical Steps:**
- **Intercom Deletion Step** - Remove conversations and user data
- **SendGrid Deletion Step** - Remove email lists and templates
- **CRM Deletion Step** - Remove customer records
- **Analytics Deletion Step** - Remove tracking data

### AI Agent Service

**PII Detection Pipeline:**
1. **Pre-filtering** - Regex patterns for emails, names, aliases
2. **Chunking** - Split documents into context windows
3. **Model Inference** - NLP model returns structured findings
4. **Post-processing** - Dedupe, cluster, attach provenance
5. **Decision Engine** - Confidence-based auto-delete or manual review

**Agent Interface:**
```typescript
interface PIIFinding {
  matchId: string
  system: string
  location: string
  piiType: 'email' | 'name' | 'phone' | 'address' | 'custom'
  confidence: number // 0.0 to 1.0
  snippet: string
  provenance: {
    messageId?: string
    timestamp: string
    channel?: string
  }
}
```

### Background Job System

**Job Types:**
- **S3 Cold Storage Scan** - Scan backup files for PII
- **Data Warehouse Scan** - Scan analytics databases
- **Backup Restoration Check** - Verify backups don't contain PII

**Job Interface:**
```typescript
interface BackgroundJob {
  jobId: string
  type: 'S3_SCAN' | 'WAREHOUSE_SCAN' | 'BACKUP_CHECK'
  workflowId: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  progress: number // 0-100
  checkpoints: string[] // Resumable checkpoints
  findings: PIIFinding[]
}
```

### State Management

**Workflow State Schema:**
```typescript
interface WorkflowState {
  workflowId: string
  userIdentifiers: {
    userId: string
    emails: string[]
    phones: string[]
    aliases: string[]
  }
  status: 'IN_PROGRESS' | 'COMPLETED' | 'COMPLETED_WITH_EXCEPTIONS' | 'FAILED' | 'AWAITING_MANUAL_REVIEW'
  policyVersion: string
  legalHolds: {
    system: string
    reason: string
    expiresAt?: string
  }[]
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
  backgroundJobs: {
    [jobId: string]: BackgroundJob
  }
  auditHashes: string[] // SHA-256 hash chain
  dataLineageSnapshot: {
    systems: string[]
    identifiers: string[]
    capturedAt: string
  }
}
```

## Data Models

### Erasure Request
```typescript
interface ErasureRequest {
  requestId: string
  userIdentifiers: UserIdentifiers
  legalProof: {
    type: 'SIGNED_REQUEST' | 'LEGAL_FORM' | 'OTP_VERIFIED'
    evidence: string
    verifiedAt: string
  }
  jurisdiction: 'EU' | 'US' | 'OTHER'
  requestedBy: {
    userId: string
    role: string
    organization: string
  }
  createdAt: string
  workflowId?: string
}
```

### Certificate of Destruction
```typescript
interface CertificateOfDestruction {
  certificateId: string
  workflowId: string
  userIdentifiers: UserIdentifiers // Redacted as needed
  completedAt: string
  status: 'COMPLETED' | 'COMPLETED_WITH_EXCEPTIONS'
  systemReceipts: {
    system: string
    status: 'DELETED' | 'FAILED' | 'LEGAL_HOLD'
    evidence: string
    timestamp: string
  }[]
  legalHolds: {
    system: string
    reason: string
    justification: string
  }[]
  policyVersion: string
  dataLineageSnapshot: any
  auditHashRoot: string
  signature: string // Cryptographic signature
}
```

### Policy Configuration
```typescript
interface PolicyConfig {
  version: string
  jurisdiction: 'EU' | 'US' | 'OTHER'
  retentionRules: {
    system: string
    retentionDays: number
    priority: number
  }[]
  legalHoldRules: {
    system: string
    conditions: string[]
    maxDuration: number
  }[]
  zombieCheckInterval: number // Days
  confidenceThresholds: {
    autoDelete: number // e.g., 0.8
    manualReview: number // e.g., 0.5
  }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Workflow Management Properties

**Property 1: Request Validation Consistency**
*For any* erasure request with valid identifiers and legal proof, the system should create exactly one workflow instance and reject invalid requests with proper audit logging
**Validates: Requirements 1.1, 1.2**

**Property 2: Concurrency Control**
*For any* user identifier, multiple concurrent erasure requests should result in only one active workflow, with subsequent requests either attaching to the existing workflow or being properly queued
**Validates: Requirements 1.3, 1.5, 1.6**

**Property 3: Data Lineage Capture**
*For any* created workflow, the system should capture a complete pre-deletion data lineage snapshot containing all detected systems and user identifiers
**Validates: Requirements 1.4, 1.7**

### Sequential Deletion Properties

**Property 4: Identity-Critical Ordering**
*For any* workflow, Stripe deletion must complete successfully before database deletion begins, and both must succeed before the "identity: GONE" checkpoint is set
**Validates: Requirements 2.1, 2.2, 2.3**

**Property 5: Critical Failure Handling**
*For any* identity-critical step that fails after all retry attempts, the workflow should halt and require manual intervention rather than proceeding to parallel steps
**Validates: Requirements 2.4**

### Parallel Processing Properties

**Property 6: Parallel Step Triggering**
*For any* workflow, parallel deletion steps for non-critical systems should only begin after the "identity: GONE" checkpoint is reached
**Validates: Requirements 3.1**

**Property 7: State Update Consistency**
*For any* parallel deletion step completion, the workflow state should be updated with success status and evidence receipts in a consistent manner
**Validates: Requirements 3.2**

**Property 8: Retry Logic Correctness**
*For any* failed parallel deletion step, the system should implement exponential backoff retry logic and record all attempts in the audit trail
**Validates: Requirements 3.3, 3.4**

### PII Detection Properties

**Property 9: Agent Pre-filtering**
*For any* unstructured data input, the PII agent should apply regex pre-filtering for emails, names, and aliases before processing
**Validates: Requirements 4.1**

**Property 10: Structured Output Format**
*For any* text content processed by the PII agent, the output should contain structured findings with match location, PII type, and confidence scores
**Validates: Requirements 4.2**

**Property 11: Confidence-Based Actions**
*For any* PII finding, the system should automatically spawn deletion steps for confidence ≥ 0.8, flag for manual review for 0.5-0.8, and ignore for < 0.5
**Validates: Requirements 4.3, 4.4**

**Property 12: Agent Audit Completeness**
*For any* PII agent operation, all inputs and outputs should be recorded in the audit trail with proper data minimization (references instead of raw content)
**Validates: Requirements 4.5, 4.6, 4.7**

### Background Job Properties

**Property 13: Job Resumability**
*For any* background job, if the process crashes, the job should resume from the last recorded checkpoint without duplicating work
**Validates: Requirements 5.1, 5.3**

**Property 14: Progress Reporting**
*For any* running background job, progress updates should be consistently reported to the workflow state
**Validates: Requirements 5.2**

**Property 15: PII Discovery Handling**
*For any* PII found during background scans, the system should spawn appropriate deletion steps and update audit trails
**Validates: Requirements 5.4**

**Property 16: Completion Detection**
*For any* set of background jobs in a workflow, the scan phase should only be marked complete when all jobs reach terminal states
**Validates: Requirements 5.5**

### Audit Trail Properties

**Property 17: Immutable Audit Logging**
*For any* deletion operation or workflow state change, the system should create timestamped, hash-chained audit entries that detect tampering
**Validates: Requirements 6.1, 6.2, 6.5**

**Property 18: Certificate Generation**
*For any* successfully completed workflow, the system should generate a Certificate of Destruction containing workflow ID, redacted identifiers, system receipts, signed hash roots, and data lineage snapshot
**Validates: Requirements 6.3, 6.4, 6.6**

### Real-time Monitoring Properties

**Property 19: Live Status Streaming**
*For any* workflow step execution or status change, the system should publish real-time updates through event streams to monitoring interfaces
**Validates: Requirements 7.1, 7.3**

**Property 20: Error Streaming**
*For any* error occurrence, the system should stream error details and remediation steps to the monitoring interface
**Validates: Requirements 7.4**

**Property 21: Completion Notifications**
*For any* completed workflow, the system should notify compliance teams through configured channels
**Validates: Requirements 7.5**

### Zombie Data Detection Properties

**Property 22: Zombie Check Scheduling**
*For any* completed erasure workflow, the system should schedule a zombie data check for the configured interval (default 30 days) using cron scheduling
**Validates: Requirements 8.1**

**Property 23: Zombie Detection and Response**
*For any* zombie check that detects previously deleted data, the system should automatically spawn a new erasure workflow and alert legal teams
**Validates: Requirements 8.2, 8.3**

**Property 24: Zombie Check Audit**
*For any* zombie check result (positive or negative), the system should record the verification in the audit trail
**Validates: Requirements 8.4, 8.5**

### Legal Hold Properties

**Property 25: Legal Hold Enforcement**
*For any* system marked with LEGAL_HOLD status, the system should exclude it from deletion operations and document the exemption in certificates
**Validates: Requirements 9.1, 9.2, 9.3**

**Property 26: Legal Hold Audit**
*For any* legal hold decision or expiration, the system should record the action with timestamps, legal basis, and allow resumption of operations when appropriate
**Validates: Requirements 9.4, 9.5**

### Partial Completion Properties

**Property 27: Exception State Handling**
*For any* workflow where some deletion steps fail permanently, the system should reach COMPLETED_WITH_EXCEPTIONS state and document unresolved systems with evidence
**Validates: Requirements 10.1, 10.2, 10.3**

**Property 28: Audit Clarity for Exceptions**
*For any* partially completed workflow, the audit trail should clearly distinguish between successful deletions and documented failures, providing remediation guidance
**Validates: Requirements 10.4, 10.5**

### Policy-Driven Properties

**Property 29: Jurisdiction-Based Policy Application**
*For any* workflow, the system should apply the correct policy configuration based on user jurisdiction and enforce region-specific deletion rules
**Validates: Requirements 11.1, 11.2**

**Property 30: Policy Versioning and Audit**
*For any* workflow execution, the system should record the applied policy version in audit trails and certificates, maintaining historical policy records
**Validates: Requirements 11.3, 11.4, 11.5**

## Error Handling

### Error Classification

1. **Validation Errors** - Invalid request format, missing legal proof
2. **Authentication Errors** - Invalid credentials, insufficient permissions
3. **System Errors** - External API failures, network timeouts
4. **Business Logic Errors** - Concurrent workflows, policy violations
5. **Infrastructure Errors** - Database failures, message queue issues

### Error Response Strategy

**API Layer:**
- Use Motia's core middleware for consistent error handling
- Return structured error responses with error codes
- Log all errors with appropriate severity levels
- Implement circuit breakers for external system calls

**Workflow Steps:**
- Implement exponential backoff retry logic
- Record all retry attempts in audit trail
- Escalate to manual intervention after max retries
- Preserve workflow state for resumability

**Background Jobs:**
- Checkpoint progress for resumability
- Implement job-specific retry policies
- Alert on job failures exceeding thresholds
- Provide job status monitoring

### Custom Error Classes

```typescript
// Base error class following Motia patterns
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

// Specific error types
export class WorkflowLockError extends GhostProtocolError {
  constructor(userId: string) {
    super(
      'Concurrent workflow detected for user',
      409,
      'WORKFLOW_LOCK_ERROR',
      { userId }
    )
  }
}

export class LegalHoldError extends GhostProtocolError {
  constructor(system: string, reason: string) {
    super(
      'System under legal hold',
      403,
      'LEGAL_HOLD_ERROR',
      { system, reason }
    )
  }
}
```

## Testing Strategy

### Dual Testing Approach

The system requires both unit testing and property-based testing to ensure comprehensive coverage:

**Unit Tests:**
- Verify specific examples and edge cases
- Test integration points between components
- Validate error conditions and boundary cases
- Test middleware functionality and authentication flows

**Property-Based Tests:**
- Verify universal properties across all inputs using **fast-check** (JavaScript property-based testing library)
- Each property-based test will run a minimum of 100 iterations
- Tests will be tagged with comments referencing design document properties
- Format: `**Feature: gdpr-erasure-system, Property {number}: {property_text}**`

### Property-Based Testing Configuration

**Library:** fast-check for JavaScript/TypeScript
**Iterations:** Minimum 100 per property test
**Test Organization:** Co-located with source files using `.test.ts` suffix
**Generator Strategy:** Smart generators that constrain to valid input spaces

### Testing Priorities

1. **Workflow State Management** - Ensure state transitions are correct
2. **Audit Trail Integrity** - Verify hash chains and tamper detection
3. **Concurrency Control** - Test user locks and duplicate handling
4. **PII Detection Accuracy** - Validate agent confidence thresholds
5. **Background Job Resumability** - Test crash recovery scenarios
6. **Certificate Generation** - Verify legal document completeness

### Mock Strategy

- **External APIs:** Mock Stripe, Intercom, SendGrid for deterministic testing
- **File Systems:** Mock S3 operations for background job testing
- **Time:** Mock date/time for cron scheduling tests
- **Crypto:** Use deterministic signatures for certificate testing

The testing strategy emphasizes correctness validation through property-based testing while using unit tests for specific integration scenarios and edge cases.