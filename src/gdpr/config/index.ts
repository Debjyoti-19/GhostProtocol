/**
 * Configuration for GhostProtocol GDPR erasure system
 */
export const ghostProtocolConfig = {
  // Workflow configuration
  workflow: {
    defaultZombieCheckInterval: 30, // days
    maxRetryAttempts: 3,
    retryBackoffMultiplier: 2,
    initialRetryDelay: 1000, // ms
  },

  // PII Agent configuration
  piiAgent: {
    confidenceThresholds: {
      autoDelete: 0.8,
      manualReview: 0.5,
    },
    maxChunkSize: 4000, // characters
    preFilterPatterns: {
      email: /\b[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}\b/g,
      phone: /\b(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})\b/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    }
  },

  // Background job configuration
  backgroundJobs: {
    maxConcurrentJobs: 5,
    checkpointInterval: 1000, // items processed
    progressReportInterval: 10000, // ms
  },

  // Audit configuration
  audit: {
    hashAlgorithm: 'sha256',
    enableTamperDetection: true,
    retentionPeriod: 2555, // days (7 years)
  },

  // Certificate configuration
  certificate: {
    validityPeriod: 365, // days
    includeDataLineage: true,
    signCertificates: true,
  },

  // External system timeouts
  externalSystems: {
    stripe: {
      timeout: 30000, // ms
      maxRetries: 3,
    },
    intercom: {
      timeout: 15000, // ms
      maxRetries: 3,
    },
    sendgrid: {
      timeout: 10000, // ms
      maxRetries: 3,
    },
    s3: {
      timeout: 60000, // ms
      maxRetries: 5,
    }
  }
}

export type GhostProtocolConfig = typeof ghostProtocolConfig