# Requirements Document

## Introduction

GhostProtocol is a forward-only, durable orchestration engine that handles Right-to-Be-Forgotten requests (GDPR/CCPA) by systematically removing personal data across fragmented SaaS stacks within legal windows with provable evidence. The system uses Motia's workflow primitives to orchestrate deletion steps, AI agents for PII detection in unstructured data, and maintains an immutable audit trail for legal compliance.

## Glossary

- **GhostProtocol**: The complete GDPR/CCPA erasure orchestration system
- **Erasure_Request**: A formal request to delete all personal data for a specific user
- **Workflow_Engine**: Motia-based orchestration system that manages deletion steps
- **PII_Agent**: AI agent that detects personally identifiable information in unstructured data
- **Audit_Trail**: Immutable, tamper-evident log of all deletion operations
- **Certificate_of_Destruction**: Legal document proving complete data erasure
- **Zombie_Data**: Personal data that reappears after deletion (from backups/restores)
- **Identity_Critical_Systems**: Core systems (Stripe, Database) that must be deleted sequentially
- **Background_Scanner**: Long-running jobs that scan cold storage and backups

## The GhostProtocol Primitive Map

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

## Requirements

### Requirement 1

**User Story:** As a compliance officer, I want to initiate erasure requests through a validated API, so that I can ensure legal identity verification before starting data deletion workflows.

#### Acceptance Criteria

1. WHEN a compliance officer submits an erasure request with user identifiers and legal proof, THE Workflow_Engine SHALL validate the identity and create a new workflow instance
2. WHEN identity validation fails, THE Workflow_Engine SHALL reject the request and maintain audit logs of the rejection
3. WHEN a valid erasure request is received, THE Workflow_Engine SHALL acquire a per-user lock to prevent concurrent deletion workflows
4. WHEN the workflow is created, THE Workflow_Engine SHALL snapshot all connected integrations and user identifiers for the deletion scope
5. WHEN an erasure request is submitted, THE Workflow_Engine SHALL check for existing workflows using user identifiers and request hash for idempotency
6. WHEN a duplicate request is detected, THE Workflow_Engine SHALL attach to the existing workflow and record the deduplication decision in audit logs
7. WHEN the workflow begins, THE Workflow_Engine SHALL record a pre-deletion data lineage snapshot listing all detected systems and identifiers

### Requirement 2

**User Story:** As a legal team member, I want sequential deletion of identity-critical systems, so that billing and core user data are removed in the correct order to prevent data inconsistencies.

#### Acceptance Criteria

1. WHEN the workflow begins identity-critical deletion, THE Workflow_Engine SHALL delete Stripe customer data first with retry logic and record API responses
2. WHEN Stripe deletion succeeds, THE Workflow_Engine SHALL delete database user records and record transaction hashes
3. WHEN both identity-critical deletions complete, THE Workflow_Engine SHALL mark an "identity: GONE" checkpoint in workflow state
4. WHEN any identity-critical step fails after retries, THE Workflow_Engine SHALL halt the workflow and require manual intervention

### Requirement 3

**User Story:** As a data protection officer, I want parallel deletion of non-critical systems, so that the erasure process completes efficiently while maintaining audit trails.

#### Acceptance Criteria

1. WHEN identity-critical systems are marked as deleted, THE Workflow_Engine SHALL spawn parallel deletion steps for Intercom, SendGrid, CRM, and analytics systems
2. WHEN each parallel deletion step completes, THE Workflow_Engine SHALL update workflow state with success status and evidence receipts
3. WHEN parallel deletion steps fail, THE Workflow_Engine SHALL retry with exponential backoff and record all attempts
4. WHEN a system permanently rejects deletion, THE Workflow_Engine SHALL mark the step as failed and provide remediation guidance

### Requirement 4

**User Story:** As a compliance auditor, I want AI-powered detection of PII in unstructured data, so that hidden personal information in messages and documents is identified and removed.

#### Acceptance Criteria

1. WHEN the PII_Agent scans unstructured data, THE PII_Agent SHALL pre-filter content using regex patterns for emails, names, and known aliases
2. WHEN text content is processed, THE PII_Agent SHALL return structured findings with match location, PII type, and confidence scores
3. WHEN PII matches have confidence above 0.8, THE Workflow_Engine SHALL automatically spawn deletion steps for the identified content
4. WHEN PII matches have confidence between 0.5-0.8, THE Workflow_Engine SHALL flag content for manual legal review
5. WHEN the PII_Agent processes content, THE Workflow_Engine SHALL record all agent inputs and outputs in the audit trail
6. WHEN the PII_Agent operates, THE PII_Agent SHALL process only pre-scoped data sources and redact non-relevant content from logs
7. WHEN the PII_Agent generates outputs, THE Workflow_Engine SHALL store references and metadata rather than raw content to minimize PII exposure

### Requirement 5

**User Story:** As a system administrator, I want resumable background jobs for scanning cold storage, so that long-running backup scans can complete reliably even if processes restart.

#### Acceptance Criteria

1. WHEN cold storage scanning is required, THE Background_Scanner SHALL create resumable jobs with unique job IDs stored in workflow state
2. WHEN background jobs are running, THE Background_Scanner SHALL report progress updates to the workflow state
3. WHEN a background job process crashes, THE Background_Scanner SHALL resume from the last recorded checkpoint
4. WHEN background scans find PII in backups, THE Background_Scanner SHALL spawn deletion steps and update audit trails
5. WHEN all background jobs complete, THE Background_Scanner SHALL mark the scan phase as completed in workflow state

### Requirement 6

**User Story:** As a legal counsel, I want tamper-evident audit trails and certificates of destruction, so that I can provide legally defensible proof of complete data erasure.

#### Acceptance Criteria

1. WHEN any deletion operation occurs, THE Audit_Trail SHALL record timestamped events with per-step evidence and API receipts
2. WHEN workflow state changes, THE Audit_Trail SHALL append events to an immutable log with SHA-256 hash chains
3. WHEN all deletion steps complete successfully, THE Workflow_Engine SHALL generate a Certificate_of_Destruction with signed evidence
4. WHEN the certificate is generated, THE Workflow_Engine SHALL include workflow ID, redacted user identifiers, per-system receipts, and signed hash roots
5. WHEN audit data is accessed, THE Audit_Trail SHALL verify hash chain integrity to detect tampering
6. WHEN the Certificate_of_Destruction is generated, THE Workflow_Engine SHALL embed the pre-deletion data lineage snapshot for legal defensibility

### Requirement 7

**User Story:** As a compliance team member, I want real-time progress monitoring, so that I can track erasure workflows and respond to issues immediately.

#### Acceptance Criteria

1. WHEN workflow steps execute, THE Workflow_Engine SHALL publish live status updates through event streams
2. WHEN the admin UI loads, THE Workflow_Engine SHALL display a network graph showing all deletion steps and their current status
3. WHEN steps change status, THE Workflow_Engine SHALL update the UI in real-time with progress indicators
4. WHEN errors occur, THE Workflow_Engine SHALL stream error details and remediation steps to the monitoring interface
5. WHEN workflows complete, THE Workflow_Engine SHALL notify compliance teams through configured channels

### Requirement 8

**User Story:** As a data protection officer, I want automated zombie data detection, so that personal data restored from backups is automatically re-deleted to maintain compliance.

#### Acceptance Criteria

1. WHEN an erasure workflow completes, THE Workflow_Engine SHALL schedule a zombie data check for 30 days later using cron scheduling
2. WHEN the zombie check runs, THE Workflow_Engine SHALL re-scan critical systems for the previously deleted user identifiers
3. WHEN zombie data is detected, THE Workflow_Engine SHALL automatically spawn a new erasure workflow and alert legal teams
4. WHEN zombie checks find no data, THE Workflow_Engine SHALL record the verification in the audit trail
5. WHEN zombie detection fails, THE Workflow_Engine SHALL alert administrators and schedule retry attempts

### Requirement 9

**User Story:** As legal counsel, I want to place systems under legal hold, so that legally required data is preserved while non-exempt data is erased according to regulatory requirements.

#### Acceptance Criteria

1. WHEN legal holds are required, THE Workflow_Engine SHALL allow marking specific systems as LEGAL_HOLD status
2. WHEN systems are under legal hold, THE Workflow_Engine SHALL exclude held systems from deletion operations
3. WHEN workflows complete with legal holds, THE Certificate_of_Destruction SHALL list exempted systems with legal justification
4. WHEN legal holds are applied, THE Audit_Trail SHALL record the hold decision with timestamps and legal basis
5. WHEN legal holds expire, THE Workflow_Engine SHALL allow resuming deletion operations for previously held systems

### Requirement 10

**User Story:** As legal counsel, I want workflows to complete with partial success, so that compliance status is clearly documented even when third-party systems fail to cooperate.

#### Acceptance Criteria

1. WHEN some deletion steps fail permanently, THE Workflow_Engine SHALL support terminal states of COMPLETED_WITH_EXCEPTIONS
2. WHEN workflows complete with exceptions, THE Certificate_of_Destruction SHALL list unresolved systems with timestamps and error evidence
3. WHEN third-party systems reject deletion, THE Workflow_Engine SHALL document best-effort attempts with API responses and retry logs
4. WHEN partial completion occurs, THE Audit_Trail SHALL clearly distinguish between successful deletions and documented failures
5. WHEN exceptions exist, THE Workflow_Engine SHALL provide remediation guidance and manual override capabilities for legal teams

### Requirement 11

**User Story:** As a compliance administrator, I want policy-driven deletion rules, so that workflows adapt to different jurisdictional requirements and organizational policies.

#### Acceptance Criteria

1. WHEN workflows are configured, THE Workflow_Engine SHALL apply policy configurations based on user jurisdiction (EU vs US vs other regions)
2. WHEN retention rules vary by region, THE Workflow_Engine SHALL enforce different deletion timelines and system priorities per policy
3. WHEN workflows execute, THE Audit_Trail SHALL include a snapshot of the applied policy configuration for legal traceability
4. WHEN policies change, THE Workflow_Engine SHALL version policy configurations and maintain historical policy records
5. WHEN workflows complete, THE Certificate_of_Destruction SHALL reference the specific policy version that governed the deletion process