# GhostProtocol Integration Connectors

This directory contains integration connectors for external systems used in the GDPR erasure workflow.

## Overview

Each connector provides a clean interface for interacting with external systems, handling:
- API authentication and configuration
- Request/response formatting
- Error handling and retries
- Mock implementations for testing/demo

## Available Connectors

### 1. Stripe Connector (`stripe-connector.ts`)

**Purpose:** Delete customer data and cancel subscriptions from Stripe

**Key Methods:**
- `deleteCustomer(userId, emails)` - Delete a customer record
- `cancelSubscriptions(userId)` - Cancel all active subscriptions
- `verifyDeletion(userId)` - Verify customer was deleted

**Configuration:**
```typescript
const stripe = new StripeConnector(apiKey, timeout)
// Or use singleton
import { stripeConnector } from './integrations'
```

**Environment Variables:**
- `STRIPE_SECRET_KEY` - Stripe API secret key

### 2. Database Connector (`database-connector.ts`)

**Purpose:** Delete or anonymize user data from PostgreSQL database

**Key Methods:**
- `deleteUser(userIdentifiers)` - Delete user records
- `anonymizeUser(userIdentifiers)` - Anonymize user data (for retention requirements)
- `verifyDeletion(userId)` - Verify user was deleted
- `executeQuery(query, params)` - Execute raw SQL

**Configuration:**
```typescript
const db = new DatabaseConnector({
  host: 'localhost',
  port: 5432,
  database: 'ghostprotocol',
  user: 'postgres',
  password: 'postgres',
  ssl: false
})
// Or use singleton
import { databaseConnector } from './integrations'
```

**Environment Variables:**
- `DB_HOST` - Database host
- `DB_PORT` - Database port
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `DB_SSL` - Enable SSL (true/false)

### 3. Intercom Connector (`intercom-connector.ts`)

**Purpose:** Delete user data and conversations from Intercom

**Key Methods:**
- `deleteUser(userIdentifiers)` - Delete user and all associated data
- `deleteConversations(userId, conversationIds)` - Delete specific conversations
- `verifyDeletion(userId)` - Verify user was deleted

**Configuration:**
```typescript
const intercom = new IntercomConnector(apiKey, timeout)
// Or use singleton
import { intercomConnector } from './integrations'
```

**Environment Variables:**
- `INTERCOM_API_KEY` - Intercom API key

### 4. SendGrid Connector (`sendgrid-connector.ts`)

**Purpose:** Delete email contacts and suppress emails from SendGrid

**Key Methods:**
- `deleteContacts(userIdentifiers)` - Delete contacts and lists
- `suppressEmails(emails)` - Add emails to global suppression list
- `deleteTemplates(userId, templateIds)` - Delete custom templates
- `verifyDeletion(emails)` - Verify contacts were deleted

**Configuration:**
```typescript
const sendgrid = new SendGridConnector(apiKey, timeout)
// Or use singleton
import { sendGridConnector } from './integrations'
```

**Environment Variables:**
- `SENDGRID_API_KEY` - SendGrid API key

### 5. CRM Connector (`crm-connector.ts`)

**Purpose:** Delete customer records from CRM systems (Salesforce, HubSpot, etc.)

**Key Methods:**
- `deleteCustomer(userIdentifiers)` - Delete customer and related records
- `deleteRecords(userId, recordType, recordIds)` - Delete specific records
- `verifyDeletion(userId)` - Verify customer was deleted

**Configuration:**
```typescript
const crm = new CRMConnector(apiKey, 'salesforce', timeout)
// Or use singleton
import { crmConnector } from './integrations'
```

**Environment Variables:**
- `CRM_API_KEY` - CRM API key

### 6. MinIO Connector (`minio-connector.ts`)

**Purpose:** Scan and delete files from S3-compatible cold storage

**Key Methods:**
- `scanBucket(bucketName, userIdentifiers, prefix, checkpoint)` - Scan for PII
- `deleteFiles(bucketName, fileKeys)` - Delete specific files
- `listObjects(bucketName, prefix, maxKeys)` - List objects in bucket
- `getFileContent(bucketName, fileKey)` - Download file content
- `bucketExists(bucketName)` - Check if bucket exists
- `ensureBucket(bucketName)` - Create bucket if needed

**Configuration:**
```typescript
const minio = new MinIOConnector({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin'
})
// Or use singleton
import { minioConnector } from './integrations'
```

**Environment Variables:**
- `MINIO_ENDPOINT` - MinIO server endpoint
- `MINIO_PORT` - MinIO server port
- `MINIO_USE_SSL` - Enable SSL (true/false)
- `MINIO_ACCESS_KEY` - MinIO access key
- `MINIO_SECRET_KEY` - MinIO secret key

## Usage in Deletion Steps

The connectors are designed to be used by the deletion event steps:

```typescript
import { stripeConnector } from '../integrations/index.js'

// In deletion step handler
const result = await stripeConnector.deleteCustomer(
  userIdentifiers.userId,
  userIdentifiers.emails
)

if (result.success) {
  // Update workflow state with receipt
  workflowState.steps[stepName].evidence = {
    receipt: result.receipt,
    timestamp: new Date().toISOString(),
    apiResponse: result.apiResponse
  }
}
```

## Mock vs Production

**Current Implementation:** All connectors use mock implementations suitable for:
- Hackathon demos
- Development testing
- Integration testing

**Production Migration:** To use real APIs:

1. Install official SDKs:
```bash
npm install stripe @sendgrid/client @intercom/client minio pg
```

2. Replace mock implementations with real API calls
3. Configure proper authentication and error handling
4. Update timeout and retry configurations

## Testing

Each connector includes:
- Configurable success rates for testing failure scenarios
- Realistic delays to simulate API latency
- Proper error responses matching real API formats

## Error Handling

All connectors return consistent result objects:

```typescript
interface DeletionResult {
  success: boolean
  receipt?: string
  apiResponse?: any
  error?: string
}
```

This allows deletion steps to handle errors uniformly across all integrations.

## Requirements Validation

These connectors satisfy the following requirements:

- **Requirement 2.1, 2.2:** Stripe and Database connectors for identity-critical deletions
- **Requirement 3.1:** Intercom, SendGrid, and CRM connectors for parallel deletions
- **Requirement 5.1:** MinIO connector for cold storage scanning

## Future Enhancements

- Add real SDK implementations
- Implement connection pooling for database
- Add circuit breakers for external API calls
- Implement request batching for bulk operations
- Add metrics and monitoring hooks
