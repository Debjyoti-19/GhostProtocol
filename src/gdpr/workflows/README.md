# GhostProtocol Child Workflows

This directory contains child workflows that isolate failures and organize complex operations.

## Why Child Workflows?

Child workflows provide **failure isolation** - if a child workflow fails, it doesn't crash the parent workflow. This is critical for GDPR erasure where:
- Non-critical system failures shouldn't block the entire workflow
- Long-running scans can be isolated from the main deletion flow
- Parallel operations can fail independently

## Available Child Workflows

### 1. Parallel Deletions Workflow (`parallel-deletions.workflow.ts`)

**Purpose**: Handles all non-critical parallel deletion steps

**Systems**:
- Intercom (conversations, user data)
- SendGrid (email lists, templates)
- CRM (customer records)
- Analytics (tracking data)

**Triggered by**: `CheckpointValidation` after identity-critical steps complete

**Benefits**:
- If Intercom fails, SendGrid/CRM/Analytics still proceed
- Failures are logged but don't block workflow completion
- Can be retried independently

**Flow**:
```
CheckpointValidation 
  → spawn-parallel-deletions-workflow
    → SpawnParallelWorkflow
      → [Intercom, SendGrid, CRM, Analytics] (parallel)
```

### 2. Background Scans Workflow (`background-scans.workflow.ts`)

**Purpose**: Handles long-running background scanning operations

**Scan Types**:
- S3 Cold Storage Scan (backup files)
- Data Warehouse Scan (analytics databases)

**Triggered by**: After parallel deletions complete (or can be triggered independently)

**Benefits**:
- Long-running scans don't block the main workflow
- Can resume from checkpoints if interrupted
- Isolated failure handling

**Flow**:
```
ParallelDeletionsCompleted
  → spawn-background-scans-workflow
    → BackgroundScansWorkflow
      → [S3Scan, WarehouseScan] (parallel)
```

## Workflow Architecture

### Main Workflow (Parent)
```
CreateErasureRequest (API)
  ↓
IdentityCriticalOrchestrator
  ↓
StripeDeletion → DatabaseDeletion (sequential)
  ↓
CheckpointValidation
  ↓
SpawnParallelWorkflow (spawns child)
  ↓
[Wait for child completion]
  ↓
WorkflowCompletion
```

### Child Workflow: Parallel Deletions
```
SpawnParallelWorkflow
  ↓
[Intercom, SendGrid, CRM, Analytics] (all parallel)
  ↓
ParallelDeletionsCompleted
```

### Child Workflow: Background Scans
```
BackgroundScansWorkflow
  ↓
[S3Scan, WarehouseScan] (parallel)
  ↓
BackgroundScansCompleted
```

## Benefits of This Architecture

1. **Failure Isolation**: Child workflow failures don't crash parent
2. **Cleaner Visualization**: Workbench shows clear parent/child relationships
3. **Independent Retry**: Can retry child workflows without restarting parent
4. **Better Monitoring**: Each child workflow has its own metrics
5. **Scalability**: Child workflows can be distributed across workers

## Event Flow

### Spawning a Child Workflow

```typescript
// In parent workflow
await emit({
  topic: 'spawn-parallel-deletions-workflow',
  data: {
    workflowId,
    userIdentifiers,
    systems: ['intercom', 'sendgrid', 'crm', 'analytics']
  }
})
```

### Child Workflow Completion

```typescript
// Child workflow emits completion
await emit({
  topic: 'parallel-deletions-completed',
  data: {
    workflowId,
    successCount,
    failureCount,
    systems
  }
})
```

## Testing Child Workflows

```bash
# Start the server
npm run dev

# Create an erasure request
curl -X POST http://localhost:3000/api/erasure-request \
  -H "Content-Type: application/json" \
  -d '{
    "userIdentifiers": {
      "userId": "user123",
      "emails": ["test@example.com"],
      "phones": ["+1234567890"],
      "aliases": ["testuser"]
    },
    "legalProof": {
      "type": "SIGNED_REQUEST",
      "evidence": "User consent form",
      "verifiedAt": "2024-01-01T00:00:00Z"
    },
    "jurisdiction": "EU",
    "requestedBy": {
      "userId": "admin",
      "role": "compliance_officer",
      "organization": "Test Org"
    }
  }'

# Monitor in Workbench
# Navigate to http://localhost:3000/workbench
# Select "erasure-workflow" flow
# Watch child workflows spawn and execute
```

## Monitoring

Child workflows emit audit logs at key points:
- `PARALLEL_DELETIONS_CHILD_WORKFLOW_SPAWNED`
- `PARALLEL_DELETIONS_CHILD_WORKFLOW_COMPLETED`
- `PARALLEL_DELETIONS_CHILD_WORKFLOW_FAILED`
- `BACKGROUND_SCANS_CHILD_WORKFLOW_SPAWNED`
- `BACKGROUND_SCANS_CHILD_WORKFLOW_COMPLETED`
- `BACKGROUND_SCANS_CHILD_WORKFLOW_FAILED`

Query these in the admin dashboard or via the audit log API.

## Requirements Validation

This architecture satisfies:
- ✅ **Requirement 3.1**: Parallel deletion triggering
- ✅ **Requirement 3.2**: State update consistency
- ✅ **Requirement 3.3**: Retry logic correctness
- ✅ **Requirement 3.4**: Controlled parallelism
- ✅ **Requirement 5.1**: Resumable background jobs
- ✅ **Requirement 5.2**: Progress reporting
- ✅ **Requirement 5.3**: Checkpoint-based resumability
- ✅ **Requirement 5.4**: PII discovery handling
- ✅ **Requirement 5.5**: Completion detection
