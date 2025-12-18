# GhostProtocol Demo System

Complete demonstration system for GhostProtocol GDPR/CCPA erasure orchestration engine.

## Quick Start

```bash
# Install dependencies
npm install

# Run visual demo (recommended for first-time viewers)
npm run demo:visual

# Run judge demo (60-second presentation)
npm run demo:judge

# Run end-to-end integration tests
npm run test:e2e

# List all available scenarios
npm run demo:list

# Generate demo report
npm run demo:report
```

## Demo Options

### 1. Visual Demo (Recommended)
**Command:** `npm run demo:visual`

Interactive, real-time visualization of a complete erasure workflow with:
- Live progress bars
- Phase-by-phase execution
- Step status indicators
- PII findings display
- Background job progress
- Certificate generation

**Duration:** ~30 seconds  
**Best for:** Understanding the complete workflow, technical demos

### 2. Judge Demo (60 seconds)
**Command:** `npm run demo:judge`

Streamlined presentation optimized for hackathon judges:
- Problem statement
- Solution overview
- Key features highlight
- Winning capabilities

**Duration:** 60 seconds  
**Best for:** Hackathon presentations, investor pitches

### 3. End-to-End Tests
**Command:** `npm run test:e2e`

Comprehensive integration tests covering:
- Complete happy path (EU user erasure)
- Concurrent request handling
- Real-time status monitoring
- Policy-driven workflows

**Duration:** ~5 seconds  
**Best for:** Validation, CI/CD pipelines

### 4. Scenario Browser
**Command:** `npm run demo:list`

Lists all 8 available demo scenarios:
1. Happy Path: Complete EU User Erasure
2. Partial Completion: Third-Party System Failure
3. PII Agent: Unstructured Data Scanning
4. Background Jobs: S3 Cold Storage Scanning
5. Zombie Data: Automated Re-deletion
6. Legal Hold: Selective Data Preservation
7. Policy Comparison: EU vs US vs Other
8. Real-time Monitoring: Admin Dashboard

**Best for:** Exploring different use cases

## Demo Scenarios

### Scenario 1: Happy Path
**User:** Alice Johnson (EU)  
**Duration:** 60 seconds  
**Demonstrates:**
- Identity-critical sequential deletion (Stripe → Database)
- Parallel non-critical deletion (Intercom, SendGrid, CRM)
- Real-time UI updates
- Certificate generation with signed evidence
- EU GDPR policy application
- Audit trail with hash chains

**Run:** `npx tsx src/gdpr/demo/demo-runner.ts run scenario_1`

### Scenario 2: Partial Completion
**User:** Bob Smith (US)  
**Duration:** 45 seconds  
**Demonstrates:**
- Retry logic with exponential backoff
- Graceful failure handling
- COMPLETED_WITH_EXCEPTIONS state
- Certificate with exception documentation
- Remediation guidance

**Run:** `npx tsx src/gdpr/demo/demo-runner.ts run scenario_2`

### Scenario 3: PII Detection
**User:** Carol Williams (EU)  
**Duration:** 30 seconds  
**Demonstrates:**
- PII Agent pre-filtering with regex
- Confidence scoring (0.0-1.0)
- Automatic deletion for high confidence (≥0.8)
- Manual review flagging for medium confidence (0.5-0.8)
- Structured PII findings output
- Audit logging with data minimization

**Run:** `npx tsx src/gdpr/demo/demo-runner.ts run scenario_3`

### Scenario 4: Background Scanning
**User:** David Chen (US)  
**Duration:** 40 seconds  
**Demonstrates:**
- Resumable background jobs
- Checkpoint-based progress tracking
- S3/MinIO integration
- PII discovery in backups
- Automatic deletion step spawning

**Run:** `npx tsx src/gdpr/demo/demo-runner.ts run scenario_4`

### Scenario 5: Zombie Detection
**User:** Henry Brown (EU)  
**Duration:** 35 seconds  
**Demonstrates:**
- Cron-based zombie checks (30-day interval)
- Re-scanning of critical systems
- Automatic new workflow spawning
- Legal team alerts
- Compliance maintenance

**Run:** `npx tsx src/gdpr/demo/demo-runner.ts run scenario_5`

### Scenario 6: Legal Hold
**User:** Frank Mueller (EU)  
**Duration:** 40 seconds  
**Demonstrates:**
- Legal hold marking for specific systems
- Exclusion of held systems from deletion
- Certificate documentation of exemptions
- Legal justification recording
- Partial deletion with compliance

**Run:** `npx tsx src/gdpr/demo/demo-runner.ts run scenario_6`

### Scenario 7: Policy Comparison
**User:** Alice Johnson (all jurisdictions)  
**Duration:** 50 seconds  
**Demonstrates:**
- Jurisdiction-based policy application
- Different deletion timelines
- Varying confidence thresholds
- Region-specific retention rules
- Policy versioning

**Run:** `npx tsx src/gdpr/demo/demo-runner.ts run scenario_7`

### Scenario 8: Real-time Monitoring
**User:** Carol Williams (EU)  
**Duration:** 45 seconds  
**Demonstrates:**
- Real-time workflow status streaming
- Network graph visualization
- Live progress indicators
- Error streaming with remediation
- Multi-workflow monitoring

**Run:** `npx tsx src/gdpr/demo/demo-runner.ts run scenario_8`

## Demo Data

### Sample Users
Located in `src/gdpr/demo/sample-users.ts`:
- Alice Johnson (EU) - Standard user
- Bob Smith (US) - User with system failures
- Carol Williams (EU) - User with extensive chat history
- David Chen (US) - User with backup data
- Emma Davis (OTHER) - International user
- Frank Mueller (EU) - User under legal hold
- Grace Lee (US) - User with partial data
- Henry Brown (EU) - Zombie data scenario

### Policies
Located in `src/gdpr/demo/policies.ts`:
- EU Policy: 30-day zombie check, 0.85 confidence threshold
- US Policy: 45-day zombie check, 0.80 confidence threshold
- Other Policy: 60-day zombie check, 0.75 confidence threshold

### Chat Exports
Located in `src/gdpr/demo/chat-exports.ts`:
- Sample Slack messages with PII
- Intercom conversations
- Support tickets
- Email threads

### Backup Files
Located in `src/gdpr/demo/backup-files.ts`:
- S3 backup manifests
- Database dumps
- Log archives
- Cold storage files

## Integration Testing

### End-to-End Test Suite
Located in `src/gdpr/demo/end-to-end-test.ts`

**Tests:**
1. Complete Happy Path - Full workflow from API to certificate
2. Concurrent Request Handling - User locking and deduplication
3. Real-time Status Monitoring - Progress tracking and updates
4. Policy-Driven Workflows - Jurisdiction-based rules

**Run:** `npm run test:e2e`

**Expected Output:**
```
✅ Complete Happy Path (Duration: 1234ms)
✅ Concurrent Request Handling (Duration: 567ms)
✅ Real-time Status Monitoring (Duration: 890ms)
✅ Policy-Driven Workflows (Duration: 345ms)

Total: 4 tests
Passed: 4
Failed: 0
Total Duration: 3036ms
```

## Judge Demo Script

Complete 60-second presentation script located in `JUDGE_DEMO_SCRIPT.md`

**Structure:**
- [0-10s] Setup & Request Submission
- [10-25s] Identity-Critical Sequential Deletion
- [25-40s] Parallel Non-Critical Deletion
- [40-55s] PII Agent & Certificate
- [55-60s] The Winning Features

**Key Points:**
- Durable workflows that survive crashes
- AI-powered PII detection
- Tamper-evident audit trails
- Policy-driven (EU GDPR vs US CCPA)
- Zombie data detection
- Legal hold support

## API Endpoints for Live Demo

### Create Erasure Request
```bash
curl -X POST http://localhost:3000/erasure-request \
  -H "Content-Type: application/json" \
  -d '{
    "userIdentifiers": {
      "userId": "alice_johnson_001",
      "emails": ["alice.johnson@example.com"],
      "phones": ["+1-555-0101"],
      "aliases": ["alice.j"]
    },
    "jurisdiction": "EU",
    "legalProof": {
      "type": "SIGNED_REQUEST",
      "evidence": "digital_signature_abc123",
      "verifiedAt": "2024-01-15T10:00:00Z"
    },
    "requestedBy": {
      "userId": "compliance_officer_001",
      "role": "Compliance Officer",
      "organization": "ACME Corp"
    }
  }'
```

### Get Workflow Status
```bash
curl http://localhost:3000/erasure-request/{workflowId}/status
```

### Download Certificate
```bash
curl http://localhost:3000/erasure-request/{workflowId}/certificate
```

### List All Workflows
```bash
curl http://localhost:3000/erasure-request/workflows
```

## Admin UI

Access the admin dashboard at: `http://localhost:3000/admin`

**Features:**
- Network graph visualization
- Real-time status updates
- Certificate download
- Manual overrides
- Error remediation

## Troubleshooting

### Demo won't start
```bash
# Check if Motia is running
npm run dev

# Verify dependencies
npm install

# Clear cache
npm run clean && npm install
```

### Visual demo is too fast/slow
Edit `src/gdpr/demo/visual-demo.ts` and adjust the `setTimeout` durations.

### End-to-end tests failing
```bash
# Run tests in verbose mode
npm run test:e2e -- --verbose

# Check Motia logs
tail -f .motia/logs/motia.log
```

## Customization

### Add New Scenario
1. Edit `src/gdpr/demo/scenarios.ts`
2. Add new scenario object
3. Export in `allScenarios` array
4. Run `npm run demo:list` to verify

### Modify Demo Data
1. Edit `src/gdpr/demo/sample-users.ts` for users
2. Edit `src/gdpr/demo/policies.ts` for policies
3. Edit `src/gdpr/demo/chat-exports.ts` for PII data

### Customize Visual Demo
Edit `src/gdpr/demo/visual-demo.ts`:
- Change progress bar width
- Modify step durations
- Add/remove phases
- Customize icons and colors

## Performance

### Demo Execution Times
- Visual Demo: ~30 seconds
- Judge Demo: 60 seconds
- End-to-End Tests: ~5 seconds
- Single Scenario: 30-60 seconds

### Resource Usage
- Memory: ~200MB
- CPU: Minimal (demo is mostly I/O)
- Disk: ~50MB for demo data

## Production Deployment

The demo system is designed for development and presentation. For production:

1. Remove demo data files
2. Configure real integrations (Stripe, Intercom, etc.)
3. Set up proper authentication
4. Configure production Redis
5. Enable monitoring and alerting

See `ADMIN_UI_IMPLEMENTATION.md` for production deployment guide.

## Support

- **Documentation:** See main README.md
- **Issues:** GitHub Issues
- **Questions:** Slack Community
- **Email:** support@ghostprotocol.dev

## License

MIT License - See LICENSE file for details
