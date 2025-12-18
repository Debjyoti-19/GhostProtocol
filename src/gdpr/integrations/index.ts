/**
 * Integration Connectors for External Systems
 * Exports all connector classes and singleton instances
 */

// Stripe Integration
export { 
  StripeConnector, 
  stripeConnector,
  type StripeCustomer,
  type StripeDeletionResult
} from './stripe-connector.js'

// Database Integration
export { 
  DatabaseConnector, 
  databaseConnector,
  type DatabaseDeletionResult,
  type DatabaseConfig
} from './database-connector.js'

// Intercom Integration
export { 
  IntercomConnector, 
  intercomConnector,
  type IntercomDeletionResult
} from './intercom-connector.js'

// SendGrid Integration
export { 
  SendGridConnector, 
  sendGridConnector,
  type SendGridDeletionResult
} from './sendgrid-connector.js'

// CRM Integration
export { 
  CRMConnector, 
  crmConnector,
  type CRMDeletionResult
} from './crm-connector.js'

// MinIO (S3-compatible) Integration
export { 
  MinIOConnector, 
  minioConnector,
  type MinIOConfig,
  type ScanResult,
  type DeletionResult
} from './minio-connector.js'
