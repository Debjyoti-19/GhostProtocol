# 👻 GhostProtocol

> **Production-grade GDPR/CCPA compliance automation with tamper-evident audit trails**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Motia](https://img.shields.io/badge/Motia-0.17.8-purple.svg)](https://motia.dev)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Demo](https://img.shields.io/badge/Demo-Watch%20Now-red.svg)](https://youtu.be/8LDRAXIxqVY?si=kDtO4qVe0cEGSNz1)

**[📺 Watch Demo Video](https://youtu.be/8LDRAXIxqVY?si=kDtO4qVe0cEGSNz1)** | **[💻 GitHub Repository](https://github.com/Debjyoti-19/GhostProtocol)**

---

## 🚨 The Problem

Companies face **$20M+ GDPR fines** for non-compliance with data deletion requests. When users exercise their "Right to Be Forgotten," organizations must:

- ❌ **Manually delete data** across 15+ fragmented SaaS platforms (Stripe, Intercom, databases, email services, cloud storage)
- ❌ **Track completion** without centralized orchestration
- ❌ **Provide legal proof** of deletion with no audit trail
- ❌ **Handle partial failures** when third-party APIs reject requests
- ❌ **Detect "zombie data"** that reappears from backup restorations
- ❌ **Complete within 30 days** or face regulatory penalties

**Real-world impact:**
> "In 2023, Meta was fined €1.2B for GDPR violations. Manual processes take weeks, lack legal defensibility, and fail to detect resurrected data from backups."

**The core challenge:** Existing solutions are fragile, don't survive crashes, and provide no cryptographic proof of deletion.

---

## ✨ The Solution

**GhostProtocol** is a forward-only, durable orchestration engine built on [Motia](https://motia.dev) that systematically handles Right-to-Be-Forgotten requests by:


🔄 **Durable Workflows** - Survives crashes and resumes from checkpoints using Motia's event-driven architecture

🎯 **Sequential + Parallel Execution** - Critical systems first (Stripe → Database), then parallel non-critical deletions

🤖 **AI-Powered PII Detection** - Finds hidden personal data in unstructured text with confidence scoring

📜 **Legal Certificates** - Cryptographically signed proof of deletion with tamper-evident audit trails

👻 **Zombie Data Detection** - Automatic 30-day re-scan for data resurrected from backups

⚖️ **Legal Hold Support** - Preserve data during litigation while erasing non-exempt information

📊 **Real-Time Monitoring** - Live dashboard with workflow visualization and progress tracking

🔐 **Tamper-Evident Audit Trail** - SHA-256 hash chains for regulatory compliance

🌍 **Policy-Driven Execution** - Different rules for EU, US, and other jurisdictions

---

## 🏗️ Architecture Diagram

```mermaid
graph TD
    A[API Request] -->|Validate Identity| B[Workflow Engine]
    B -->|Acquire User Lock| C[Data Lineage Snapshot]
    C -->|Sequential| D[Stripe Deletion]
    D -->|Sequential| E[Database Deletion]
    E -->|Checkpoint| F{Identity: GONE}
    F -->|Parallel| G[Intercom Deletion]
    F -->|Parallel| H[SendGrid Deletion]
    F -->|Parallel| I[CRM Deletion]
    F -->|Parallel| J[Analytics Deletion]
    F -->|Background| K[MinIO Storage Scan]
    F -->|Background| L[S3 Cold Storage Scan]
    K -->|PII Agent| M[AI Detection]
    L -->|PII Agent| M
    G --> N[Workflow Completion]
    H --> N
    I --> N
    J --> N
    M --> N
    N -->|Generate| O[Certificate of Destruction]
    O -->|Schedule| P[Zombie Check - 30 Days]
    P -.->|If Data Found| A
```


**High-Level Flow:**
```
[API Layer] → [Motia Orchestrator] → {Stripe, DB, Intercom, Agent Scan, S3 Job...}
    ↓
[State Store + Audit Log] → [Real-time Streams] → [Admin UI]
    ↓
[Background Jobs / Workers] → [Certificate Generation] → [Zombie Detection]
```

---

## 🎯 Key Features (Detailed)

### 1. **Concurrency Control & Idempotency**
- **Per-User Locks:** Prevents duplicate workflows for the same user
- **Request Hash Deduplication:** SHA-256 hash of request parameters ensures idempotent operations
- **Race Condition Handling:** Distributed locks with TTL prevent concurrent deletions
- **Workflow Attachment:** Duplicate requests attach to existing workflows instead of creating new ones

### 2. **AI-Powered PII Detection**
- **Pre-Filtering:** Regex patterns for emails, phones, SSNs, names reduce AI processing costs
- **Confidence Scoring:** Returns 0.0-1.0 confidence for each PII match
- **Automated Actions:**
  - **>0.8 confidence:** Auto-delete immediately
  - **0.5-0.8 confidence:** Flag for manual legal review
  - **<0.5 confidence:** Ignore as false positive
- **Audit Logging:** All agent inputs/outputs recorded without storing raw PII
- **Chunking:** Processes large documents in context windows for scalability

### 3. **Fault Tolerance & Resumability**
- **Exponential Backoff Retries:** Configurable retry logic with backoff multiplier
- **Checkpoint-Based Resumability:** Background jobs resume from last checkpoint after crashes
- **Graceful Degradation:** Workflows complete with `COMPLETED_WITH_EXCEPTIONS` status
- **Evidence Preservation:** API responses and error logs stored for legal review


### 4. **Tamper-Evident Audit Trail**
- **SHA-256 Hash Chains:** Each audit entry hashes previous entry + new data
- **Immutable Append-Only Log:** No deletion or modification of audit records
- **Integrity Verification:** Detects any tampering attempts by recomputing hash chain
- **Genesis Hash:** Workflow starts with genesis block for complete chain validation
- **Per-Step Evidence:** API receipts, timestamps, and responses for every operation

### 5. **Legal Hold Management**
- **System-Level Holds:** Mark specific systems (e.g., "Stripe") as `LEGAL_HOLD`
- **Exemption Documentation:** Legal justification recorded in audit trail
- **Certificate Inclusion:** Held systems listed in Certificate of Destruction
- **Expiration Support:** Optional expiration dates for temporary holds
- **Resumable Operations:** Deletion resumes when hold is lifted

### 6. **Policy-Driven Execution**
- **Jurisdiction-Based Rules:** Different policies for EU (GDPR), US (CCPA), and other regions
- **Retention Periods:** Configurable per-system retention rules
- **Priority Ordering:** Systems deleted in policy-defined priority order
- **Version Control:** Policy versions tracked in audit trail and certificates
- **Dynamic Updates:** Policies update without code changes

### 7. **Real-Time Monitoring**
- **Server-Sent Events (SSE):** Live workflow status updates to admin dashboard
- **Network Graph Visualization:** Visual representation of deletion steps and dependencies
- **Progress Indicators:** Per-step completion percentage and status
- **Error Streaming:** Real-time error details with remediation guidance
- **Notification Channels:** Configurable alerts for completion/failures

### 8. **Zombie Data Detection**
- **Scheduled Re-Scans:** Cron job runs every 6 hours to check for due zombie checks
- **30-Day Default Interval:** Configurable delay after workflow completion
- **Automatic Re-Deletion:** Spawns new workflow if data detected
- **Alert System:** Notifies legal teams of zombie data discoveries
- **Audit Trail Integration:** All zombie checks recorded for compliance


---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL (optional, for database connector)
- MinIO or S3-compatible storage (optional, for storage scanning)

### Installation

```bash
# Clone the repository
git clone https://github.com/Debjyoti-19/GhostProtocol.git
cd GhostProtocol

# Install dependencies
npm install

# Set up environment variables (optional for demo)
cp .env.example .env
# Edit .env with your API keys if using real integrations

# Start development server with Workbench UI
npm run dev
```

### Access the Workbench
Navigate to **http://localhost:3000** to access the visual workflow designer.

### Generate TypeScript Types
```bash
npm run generate-types
```

### Run Tests
```bash
# Run all tests
npm test

# Run end-to-end demo
npm run test:e2e

# Run visual demo with evaluation
npm run demo:visual
```

---

## 📖 Usage Examples

### 1. Initiate Erasure Request

**Simple Format (Email Only):**
```bash
curl -X POST http://localhost:3000/erasure-request \
  -H "Authorization: Bearer YOUR_COMPLIANCE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '"user@example.com"'
```

### 2. Check Workflow Status

**Using cURL:**
```bash
curl http://localhost:3000/erasure-request/7c9e6679-7425-40de-944b-e07fc1f90ae7/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Using Motia Invoke:**
```javascript
// Workbench → Steps → GetErasureStatus → Invoke
{
  "params": {
    "workflowId": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
  }
}
```

### 3. Download Certificate of Destruction

**Using cURL:**
```bash
curl http://localhost:3000/erasure-request/7c9e6679-7425-40de-944b-e07fc1f90ae7/certificate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o certificate.json
```

**Using Motia Invoke:**
```javascript
// Workbench → Steps → GetCertificate → Invoke
{
  "params": {
    "workflowId": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
  }
}
```

**Response:**
```json
{
  "certificateId": "cert_550e8400-e29b-41d4-a716-446655440000",
  "workflowId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "completedAt": "2024-01-15T11:00:00.000Z",
  "status": "COMPLETED",
  "userIdentifiers": {
    "userId": "u***5",
    "emails": ["u***r@example.com"],
    "phones": ["+1***23"],
    "aliases": ["j***e"]
  },
  "systemReceipts": [
    {
      "system": "stripe-deletion",
      "status": "DELETED",
      "evidence": "Stripe customer deleted: cus_abc123",
      "timestamp": "2024-01-15T10:31:00.000Z"
    },
    {
      "system": "database-deletion",
      "status": "DELETED",
      "evidence": "Database records deleted",
      "timestamp": "2024-01-15T10:32:00.000Z"
    }
  ],
  "legalHolds": [],
  "policyVersion": "1.0.0",
  "dataLineageSnapshot": {
    "systems": ["stripe", "database", "intercom", "sendgrid", "crm", "analytics"],
    "identifiers": ["user_12345", "user@example.com", "+1-555-0123"],
    "capturedAt": "2024-01-15T10:30:00.000Z"
  },
  "auditHashRoot": "a3f5b8c9d2e1f4a7b6c5d8e9f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0",
  "signature": "3045022100..."
}
```


### 4. List All Workflows

**Using cURL:**
```bash
curl http://localhost:3000/workflows \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔧 System Architecture (Technical Deep Dive)

### Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Framework** | [Motia](https://motia.dev) v0.17.8 | Event-driven orchestration engine |
| **Language** | TypeScript 5.7 | Type-safe development with ESM modules |
| **Validation** | Zod 4.1 | Runtime schema validation |
| **State Management** | Motia State Plugin | Redis-backed distributed state |
| **Queue** | BullMQ | Background job processing |
| **Database** | PostgreSQL | User data storage |
| **Storage** | MinIO | S3-compatible cold storage |
| **Auth** | JWT + RBAC | Role-based access control |
| **UI** | React 19 | Admin dashboard components |



### Motia Primitive Mapping

GhostProtocol leverages Motia's core primitives to build a production-grade compliance system:

| Motia Primitive | Role in GhostProtocol | Example |
|-----------------|----------------------|---------|
| **API Steps** | Entry points for erasure requests, status queries, certificate downloads | `create-erasure-request.step.ts` |
| **Event Steps** | Per-system deletion operations with retry logic | `stripe-deletion.step.ts`, `database-deletion.step.ts` |
| **Cron Steps** | Scheduled zombie data detection and policy updates | `zombie-data-check.step.ts` |
| **State Management** | Workflow state, user locks, evidence storage | User lock: `user_lock:${userId}` |
| **Background Jobs** | Long-running scans of cold storage and backups | MinIO scan, S3 scan, warehouse scan |
| **Agents** | AI-powered PII detection in unstructured data | `pii-agent.ts` with confidence scoring |
| **Streams** | Real-time UI updates and compliance monitoring | SSE streams for workflow progress |

---

## 🔄 Workflow Visualization

### Complete Execution Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 1: REQUEST INITIATION                                         │
└─────────────────────────────────────────────────────────────────────┘
    1. POST /erasure-request (API Step)
       ↓
    2. Validate legal proof & jurisdiction
       ↓
    3. Acquire user lock (prevent concurrent workflows)
       ↓
    4. Create request hash (idempotency check)
       ↓
    5. Capture data lineage snapshot
       ↓
    6. Emit 'workflow-created' event

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 2: IDENTITY-CRITICAL SEQUENTIAL DELETIONS                     │
└─────────────────────────────────────────────────────────────────────┘
    7. IdentityCriticalOrchestrator receives event
       ↓
    8. StripeDeletion (Event Step)
       - Cancel subscriptions
       - Delete customer data
       - Record API receipt
       ↓
    9. DatabaseDeletion (Event Step)
       - Delete user records
       - Anonymize related data
       - Record transaction hash
       ↓
    10. CheckpointValidation (Event Step)
        - Verify both steps completed
        - Set "identity: GONE" checkpoint

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 3: PARALLEL NON-CRITICAL DELETIONS                            │
└─────────────────────────────────────────────────────────────────────┘
    11. SpawnParallelWorkflow triggers simultaneously:
        ├─→ IntercomDeletion (conversations, user data)
        ├─→ EmailDeletion (SendGrid contacts, templates)
        ├─→ CRMDeletion (customer records)
        ├─→ AnalyticsDeletion (tracking data)
        └─→ SlackDeletion (messages, files)

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 4: BACKGROUND SCANS (Long-Running Jobs)                       │
└─────────────────────────────────────────────────────────────────────┘
    12. MinIOStorageDeletion (Background Job)
        - Scan S3-compatible storage
        - Use PII Agent for detection
        - Delete matching files
        ↓
    13. S3ColdStorageScan (Background Job)
        - Scan backup archives
        - Checkpoint-based resumability
        - Report findings
        ↓
    14. WarehouseScan (Background Job)
        - Scan data warehouses
        - Detect PII in analytics tables

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 5: COMPLETION & CERTIFICATE GENERATION                        │
└─────────────────────────────────────────────────────────────────────┘
    15. WorkflowCompletion (Event Step)
        - Aggregate all step results
        - Generate Certificate of Destruction
        - Include system receipts
        - Add cryptographic signature
        - Embed data lineage snapshot
        ↓
    16. Schedule zombie check (30 days later)

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 6: ZOMBIE DATA DETECTION (Scheduled)                          │
└─────────────────────────────────────────────────────────────────────┘
    17. ZombieDataCheck (Cron Step - runs every 6 hours)
        - Check for due zombie checks
        - Re-scan all systems
        - If data found → spawn new workflow
        - Alert legal team
```


### Step Dependencies

```
create-erasure-request.step.ts
    ↓ emits: workflow-created
identity-critical-orchestrator.step.ts
    ↓ emits: stripe-deletion
stripe-deletion.step.ts
    ↓ emits: database-deletion
database-deletion.step.ts
    ↓ emits: checkpoint-validation
checkpoint-validation.step.ts
    ↓ emits: spawn-parallel-workflow
spawn-parallel-workflow.step.ts
    ↓ emits: [intercom-deletion, email-deletion, crm-deletion, analytics-deletion, slack-deletion]
    ├─→ intercom-deletion.step.ts
    ├─→ email-deletion.step.ts
    ├─→ crm-deletion.step.ts
    ├─→ analytics-deletion.step.ts
    └─→ slack-deletion.step.ts
    ↓ all complete → emits: workflow-completed
workflow-completion.step.ts
    ↓ emits: zombie-check-scheduled
zombie-data-check.step.ts (cron: every 6 hours)
    ↓ if data found → emits: workflow-created (recursive)
```

### Error Handling Flow

```
Any Step Failure
    ↓
Retry with Exponential Backoff
    ↓
Max Retries Reached?
    ├─→ YES → Mark step as FAILED
    │         ↓
    │         Record error evidence
    │         ↓
    │         Continue with other steps
    │         ↓
    │         Workflow status: COMPLETED_WITH_EXCEPTIONS
    │
    └─→ NO → Retry after backoff delay
```

---

### Test Coverage Areas

**Workflow State Management:**
- ✅ Request validation consistency
- ✅ Concurrency control with user locks
- ✅ Data lineage capture completeness
- ✅ Idempotency with request hashing

**Sequential Deletion:**
- ✅ Identity-critical ordering (Stripe → Database)
- ✅ Checkpoint validation
- ✅ Critical failure handling

**Parallel Processing:**
- ✅ Parallel step triggering after checkpoint
- ✅ State update consistency
- ✅ Retry logic with exponential backoff

**PII Detection:**
- ✅ Agent pre-filtering accuracy
- ✅ Structured output format
- ✅ Confidence-based actions (>0.8, 0.5-0.8, <0.5)
- ✅ Agent audit completeness

**Audit Trail:**
- ✅ Immutable audit logging
- ✅ Hash chain integrity
- ✅ Certificate generation completeness
- ✅ Tamper detection

**Background Jobs:**
- ✅ Job resumability after crashes
- ✅ Progress reporting
- ✅ PII discovery handling
- ✅ Completion detection


---

## ⚖️ Compliance & Legal

### Regulatory Compliance

GhostProtocol is designed to meet the strictest data protection requirements:

#### ✅ GDPR (General Data Protection Regulation)
- **Article 17 - Right to Erasure:** Complete data deletion across all systems
- **Article 30 - Records of Processing:** Tamper-evident audit trails with SHA-256 hash chains
- **Article 32 - Security of Processing:** Cryptographically signed certificates
- **Article 33 - Breach Notification:** Real-time monitoring and alerting
- **30-Day Compliance Window:** Automated workflows complete within legal timeframe

#### ✅ CCPA (California Consumer Privacy Act)
- **Section 1798.105 - Right to Deletion:** Systematic erasure across data silos
- **Section 1798.100 - Consumer Rights:** Transparent status tracking and certificates
- **Section 1798.150 - Enforcement:** Audit trails for regulatory inspection

#### ✅ Additional Compliance Features
- **Legal Hold Support:** Preserve data during litigation (FRCP Rule 37)
- **Data Lineage Tracking:** Pre-deletion snapshot of all systems
- **Zombie Data Detection:** Automatic re-scanning for backup restorations
- **Policy Versioning:** Jurisdiction-specific rules (EU vs US vs OTHER)
- **Partial Completion Handling:** Document best-effort attempts when systems fail

### Audit Trail Features

**Tamper-Evident Logging:**
- SHA-256 hash chains link all audit entries
- Genesis hash establishes chain origin
- Integrity verification detects any tampering
- Immutable append-only log structure

**Certificate of Destruction:**
- Unique certificate ID (UUID)
- Redacted user identifiers for privacy
- Per-system deletion receipts with timestamps
- API response evidence for each operation
- Legal hold documentation with justification
- Cryptographic signature for authenticity
- Data lineage snapshot for defensibility

**Retention:**
- Audit logs retained for 7 years (2555 days)
- Certificates available for download indefinitely
- Hash chain verification available on-demand


### Legal Defensibility

**What makes GhostProtocol legally defensible:**

1. **Immutable Audit Trail:** SHA-256 hash chains prevent retroactive modification
2. **Cryptographic Signatures:** Certificates signed with private keys prove authenticity
3. **Data Lineage Snapshots:** Pre-deletion capture proves scope of deletion
4. **API Evidence:** Raw API responses from external systems prove deletion attempts
5. **Timestamp Integrity:** ISO 8601 timestamps for all operations
6. **Legal Hold Documentation:** Explicit justification for preserved data
7. **Partial Completion Transparency:** Clear documentation of failed systems
8. **Zombie Data Detection:** Proactive re-scanning proves ongoing compliance

---

## 🙏 Acknowledgments

### Built with Motia

GhostProtocol is proudly built on **[Motia](https://motia.dev)** - the open-source, unified backend framework that eliminates runtime fragmentation.

**Why Motia?**

Motia brings together APIs, background jobs, queueing, streaming, state, workflows, AI agents, observability, scaling, and deployment into **one unified system** using a single core primitive: the **Step**.

**What Motia Provides:**

🔄 **Durable Workflows** - Workflows survive crashes and resume from checkpoints automatically

⚡ **Event-Driven Architecture** - Native pub/sub with topics and subscriptions

📊 **Built-in State Management** - Redis-backed distributed state with TTL support

🎯 **Type-Safe Development** - Auto-generated TypeScript types from step configurations

🖥️ **Visual Workbench** - Interactive UI for developing and debugging workflows

🔌 **Plugin Ecosystem** - Extensible architecture with official plugins (BullMQ, Observability, Logs)

📡 **Real-Time Streaming** - Server-Sent Events (SSE) for live updates

⏰ **Cron Scheduling** - Built-in scheduled task support

🤖 **AI Agent Integration** - First-class support for AI-powered workflows

**GhostProtocol leverages Motia's primitives to build a production-grade GDPR compliance system:**

- **API Steps** for HTTP endpoints
- **Event Steps** for deletion workers
- **Cron Steps** for zombie data detection
- **State Management** for workflow orchestration
- **Background Jobs** for long-running scans
- **Agents** for PII detection
- **Streams** for real-time monitoring

**Learn more about Motia:**
- 📚 [Documentation](https://motia.dev/docs)
- 💻 [GitHub](https://github.com/MotiaDev/motia)
- 💬 [Discord Community](https://discord.gg/motia)
- 🐦 [Twitter](https://twitter.com/motiadev)


### Additional Credits

**Technologies & Libraries:**
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Zod](https://zod.dev/) - Runtime schema validation
- [BullMQ](https://docs.bullmq.io/) - Background job processing
- [PostgreSQL](https://www.postgresql.org/) - Relational database
- [MinIO](https://min.io/) - S3-compatible object storage
- [React](https://react.dev/) - UI components
- [fast-check](https://fast-check.dev/) - Property-based testing

**Special Thanks:**
- The **Motia** team for building an incredible framework

---

## 🔗  Links

### 🎥 Demo & Resources

**📺 Watch Full Demo Video:**  
[https://youtu.be/8LDRAXIxqVY?si=kDtO4qVe0cEGSNz1](https://youtu.be/8LDRAXIxqVY?si=kDtO4qVe0cEGSNz1)

**💻 GitHub Repository:**  
[https://github.com/Debjyoti-19/GhostProtocol](https://github.com/Debjyoti-19/GhostProtocol)

---

## 🎓 Documentation

### Additional Resources

**Project Documentation:**
- [Requirements Document](.Kiro/specs/gdpr-erasure-system/requirements.md) - Detailed requirements and acceptance criteria
- [Design Document](.Kiro/specs/gdpr-erasure-system/design.md) - Architecture and technical design
- [Architecture Guide](.Kiro/architecture/architecture.mdc) - Project structure and patterns
- [Error Handling Guide](.Kiro/architecture/error-handling.mdc) - Error handling best practices

**Motia Guides:**
- [API Steps Guide](.Kiro/rules/motia/api-steps.mdc) - Creating HTTP endpoints
- [Event Steps Guide](.Kiro/rules/motia/event-steps.mdc) - Background task processing
- [Cron Steps Guide](.Kiro/rules/motia/cron-steps.mdc) - Scheduled tasks
- [State Management Guide](.Kiro/rules/motia/state-management.mdc) - State and caching
- [Real-time Streaming Guide](.Kiro/rules/motia/realtime-streaming.mdc) - SSE and WebSocket patterns

### Quick Links

| Resource | Link |
|----------|------|
| 📺 Demo Video | [YouTube](https://youtu.be/8LDRAXIxqVY?si=kDtO4qVe0cEGSNz1) |
| 💻 GitHub Repo | [GhostProtocol](https://github.com/Debjyoti-19/GhostProtocol) |
| 📚 Motia Docs | [motia.dev/docs](https://motia.dev/docs) |
| 🐛 Report Issues | [GitHub Issues](https://github.com/Debjyoti-19/GhostProtocol/issues) |
| 💬 Discussions | [GitHub Discussions](https://github.com/Debjyoti-19/GhostProtocol/discussions) |

---

## 🌟 Why GhostProtocol?

**For Compliance Teams:**
- ✅ Automate 95% of manual deletion work
- ✅ Complete workflows in hours, not weeks
- ✅ Legal certificates ready for regulatory inspection
- ✅ Real-time visibility into deletion progress

**For Engineering Teams:**
- ✅ Built on proven Motia framework
- ✅ Type-safe TypeScript with Zod validation
- ✅ Event-driven architecture scales effortlessly
- ✅ Comprehensive test coverage with property-based testing

**For Legal Teams:**
- ✅ Tamper-evident audit trails (SHA-256 hash chains)
- ✅ Cryptographically signed certificates
- ✅ Legal hold support for litigation
- ✅ Zombie data detection prevents violations

**For Organizations:**
- ✅ Avoid $20M+ GDPR fines
- ✅ Reduce compliance costs by 80%
- ✅ Build customer trust with transparency
- ✅ Scale to handle thousands of requests

---

<div align="center">

## 👻 GhostProtocol

**Making data erasure invisible, but provable.**

⭐ **Star this repo** if you find it useful!  
🔔 **Watch** for updates and new features  
🤝 **Contribute** to make GDPR compliance easier for everyone

[Watch Demo](https://youtu.be/8LDRAXIxqVY?si=kDtO4qVe0cEGSNz1) • [View Code](https://github.com/Debjyoti-19/GhostProtocol) • [Report Bug](https://github.com/Debjyoti-19/GhostProtocol/issues) • [Request Feature](https://github.com/Debjyoti-19/GhostProtocol/discussions)

---

**Built with ❤️ using [Motia](https://motia.dev)**

*Protecting privacy, one deletion at a time.*

</div>
