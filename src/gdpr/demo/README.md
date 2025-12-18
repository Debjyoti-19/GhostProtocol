# GhostProtocol Demo Data & Scenarios

This directory contains comprehensive demo data and scenarios for showcasing GhostProtocol's GDPR/CCPA erasure capabilities.

## Overview

The demo system provides:
- **8 sample users** across different jurisdictions (EU, US, Other)
- **13 chat messages** with various PII patterns for agent testing
- **3 Intercom conversations** with multi-turn PII exposure
- **10 backup files** simulating S3/MinIO cold storage
- **3 policy configurations** (EU GDPR, US CCPA, General)
- **8 demo scenarios** covering all major features

## Quick Start

```typescript
import { 
  demoUsers, 
  allScenarios, 
  generateJudgeDemoScript,
  printDemoSummary 
} from './demo/index.js'

// Print summary of available demo data
printDemoSummary()

// Get the 60-second judge demo script
const script = generateJudgeDemoScript()
console.log(script)

// Get a specific user for testing
const alice = demoUsers[0] // EU user with active subscription
const bob = demoUsers[1]   // US user with canceled subscription
```

## Demo Users

### Alice Johnson (user_alice_001)
- **Jurisdiction:** EU
- **Scenario:** Happy path with complete erasure
- **Data:** Active subscription, 15 conversations, 8 orders
- **Emails:** alice.johnson@example.com, alice.j@personal.com
- **Phone:** +1-555-0101

### Bob Smith (user_bob_002)
- **Jurisdiction:** US
- **Scenario:** Partial completion with CRM failure
- **Data:** Canceled subscription, 3 conversations, 2 orders
- **Emails:** bob.smith@company.com
- **Phones:** +1-555-0202, +1-555-0203

### Carol Williams (user_carol_003)
- **Jurisdiction:** EU
- **Scenario:** PII agent detection in extensive chat history
- **Data:** Power user, 42 conversations, 25 orders
- **Emails:** carol.williams@example.org, c.williams@work.com, carol@personal.net
- **Phone:** +44-20-7123-4567

### David Chen (user_david_004)
- **Jurisdiction:** US
- **Scenario:** Background job scanning of S3 backups
- **Data:** Active subscription, 7 conversations, 12 orders
- **Email:** david.chen@startup.io
- **Phone:** +1-555-0404

### Emma Garcia (user_emma_005)
- **Jurisdiction:** EU
- **Scenario:** Minimal activity user
- **Data:** Single purchase, 1 conversation
- **Email:** emma.garcia@example.com
- **Phone:** +34-91-123-4567

### Frank Mueller (user_frank_006)
- **Jurisdiction:** EU
- **Scenario:** Legal hold on financial records
- **Data:** Active subscription, 28 conversations, 18 orders
- **Emails:** frank.mueller@example.de, f.mueller@company.de
- **Phone:** +49-30-1234-5678

### Grace Kim (user_grace_007)
- **Jurisdiction:** OTHER (South Korea)
- **Scenario:** Non-EU/US jurisdiction handling
- **Data:** Active subscription, 5 conversations, 10 orders
- **Email:** grace.kim@example.com
- **Phone:** +82-2-1234-5678

### Henry Brown (user_henry_008)
- **Jurisdiction:** US
- **Scenario:** Zombie data detection
- **Data:** No recent activity (zombie data scenario)
- **Emails:** henry.brown@example.com, h.brown@personal.com
- **Phone:** +1-555-0808

## Demo Scenarios

### 1. Happy Path: Complete EU User Erasure (60s)
**User:** Alice Johnson  
**Demonstrates:** Full workflow, sequential deletion, parallel steps, certificate generation

### 2. Partial Completion: Third-Party System Failure (45s)
**User:** Bob Smith  
**Demonstrates:** Retry logic, graceful failure, COMPLETED_WITH_EXCEPTIONS state

### 3. PII Agent: Unstructured Data Scanning (30s)
**User:** Carol Williams  
**Demonstrates:** AI-powered PII detection, confidence scoring, automatic deletion

### 4. Background Jobs: S3 Cold Storage Scanning (40s)
**User:** David Chen  
**Demonstrates:** Resumable jobs, checkpoint tracking, PII discovery in backups

### 5. Zombie Data: Automated Re-deletion (35s)
**User:** Henry Brown  
**Demonstrates:** Cron-based checks, automatic workflow spawning, compliance maintenance

### 6. Legal Hold: Selective Data Preservation (40s)
**User:** Frank Mueller  
**Demonstrates:** Legal hold marking, exemption documentation, partial deletion

### 7. Policy Comparison: EU vs US vs Other (50s)
**User:** Alice Johnson (all three policies)  
**Demonstrates:** Jurisdiction-based policies, different timelines, policy versioning

### 8. Real-time Monitoring: Admin Dashboard (45s)
**User:** Carol Williams  
**Demonstrates:** Live streaming, network graph, real-time updates, error handling

## Chat Export Data

### Slack Messages
13 messages across different channels (customer-support, sales, general, engineering) containing:
- Email addresses (alice.johnson@example.com, etc.)
- Phone numbers (+1-555-0101, +44-20-7123-4567, etc.)
- Names (Alice Johnson, Bob Smith, etc.)
- Aliases (alice_j, bob_s, etc.)

### Intercom Conversations
3 multi-turn conversations demonstrating:
- User-agent interactions
- PII exposure across multiple messages
- Context-dependent PII detection

### Support Tickets
3 tickets with varying PII patterns and statuses

## Backup Files

### Database Backups
- `database-backup-2024-01-15.sql.gz` (500 MB)
- `database-backup-2024-01-22.sql.gz` (512 MB)

### Data Exports
- `customer-data-2024-01.csv` (10 MB) - Full customer data with PII

### Application Logs
- `application-2024-01-15.log.gz` (100 MB)
- `application-2024-01-20.log.gz` (94 MB)

### Analytics Data
- `user-events-2024-01.parquet` (200 MB)

### Cold Storage Archives
- `archived-conversations-2023-Q4.json.gz` (50 MB)
- `archived-conversations-2023-Q3.json.gz` (46 MB)

## Policy Configurations

### EU GDPR Policy
- **Zombie Check:** 30 days
- **Auto-delete Threshold:** 0.85
- **Max Deletion Timeline:** 7 days
- **Strictest requirements**

### US CCPA Policy
- **Zombie Check:** 45 days
- **Auto-delete Threshold:** 0.80
- **Max Deletion Timeline:** 30 days
- **Business necessity exemptions**

### Other Jurisdictions Policy
- **Zombie Check:** 60 days
- **Auto-delete Threshold:** 0.75
- **Max Deletion Timeline:** 90 days
- **Most flexible**

## Usage Examples

### Running a Demo Scenario

```typescript
import { getScenarioById, getDemoDataForScenario } from './demo/index.js'

// Get scenario details
const scenario = getScenarioById('scenario_1')
console.log(scenario.name)
console.log(scenario.steps)

// Get all data needed for the scenario
const demoData = getDemoDataForScenario('scenario_1')
console.log(demoData.user)
console.log(demoData.policy)
```

### Testing PII Agent

```typescript
import { slackExportMessages, getMessagesForUser } from './demo/index.js'

// Get all messages with PII
const piiMessages = slackExportMessages.filter(m => m.containsPII)

// Get messages for a specific user
const aliceMessages = getMessagesForUser('alice')
```

### Simulating Backup Scanning

```typescript
import { 
  sampleBackupFiles, 
  scanBackupFileForPII,
  generateBackupManifest 
} from './demo/index.js'

// Get all backup files
const backups = sampleBackupFiles

// Scan a specific file
const result = scanBackupFileForPII(
  'backups/2024-01/database-backup-2024-01-15.sql.gz',
  ['alice.johnson@example.com']
)

// Generate manifest
const manifest = generateBackupManifest()
```

### Comparing Policies

```typescript
import { comparePolicies, getPolicyByJurisdiction } from './demo/index.js'

// Compare all policies
const comparison = comparePolicies()
console.table(comparison)

// Get specific policy
const euPolicy = getPolicyByJurisdiction('EU')
console.log(euPolicy.retentionRules)
```

## Judge Demo Script (60 seconds)

Use `generateJudgeDemoScript()` to get a complete 60-second presentation script optimized for judges:

```typescript
import { generateJudgeDemoScript } from './demo/index.js'

const script = generateJudgeDemoScript()
console.log(script)
```

The script covers:
1. Setup and introduction (5s)
2. Sequential identity-critical deletion (15s)
3. Parallel non-critical deletion (10s)
4. PII agent in action (10s)
5. Certificate generation (5s)
6. Closing remarks (5s)

## Detailed Walkthrough

For a comprehensive walkthrough of all scenarios:

```typescript
import { generateDetailedWalkthrough } from './demo/index.js'

const walkthrough = generateDetailedWalkthrough()
console.log(walkthrough)
```

## Testing Integration

All demo data is designed to work seamlessly with the GhostProtocol test suite:

```typescript
// In your tests
import { demoUsers, euGDPRPolicy } from '../demo/index.js'

test('erasure workflow with demo user', async () => {
  const alice = demoUsers[0]
  const policy = euGDPRPolicy
  
  // Use alice.identifiers for testing
  // Use policy for configuration
})
```

## Notes

- All phone numbers use the +1-555-XXXX format (US) or international equivalents
- All email addresses use example.com, example.org, or example.de domains
- All data is synthetic and safe for public demonstration
- File sizes are realistic but files are mocked (not actual binary data)
- PII patterns are designed to test various confidence levels (0.5-1.0)

## Contributing

When adding new demo data:
1. Follow existing naming conventions
2. Ensure data is realistic but synthetic
3. Document the scenario and expected outcomes
4. Update this README with new scenarios
5. Add appropriate TypeScript types
