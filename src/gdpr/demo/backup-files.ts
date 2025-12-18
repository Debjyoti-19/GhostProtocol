/**
 * Sample backup file data for MinIO/S3 scanning demonstration
 * Simulates files that might contain PII in cold storage
 */

export interface BackupFile {
  key: string
  bucket: string
  size: number
  lastModified: string
  contentType: string
  containsPII: boolean
  description: string
}

/**
 * Sample backup files in S3/MinIO
 */
export const sampleBackupFiles: BackupFile[] = [
  {
    key: 'backups/2024-01/database-backup-2024-01-15.sql.gz',
    bucket: 'ghostprotocol-backups',
    size: 524288000, // 500 MB
    lastModified: '2024-01-15T03:00:00Z',
    contentType: 'application/gzip',
    containsPII: true,
    description: 'Full database backup containing user tables with PII'
  },
  {
    key: 'backups/2024-01/database-backup-2024-01-22.sql.gz',
    bucket: 'ghostprotocol-backups',
    size: 536870912, // 512 MB
    lastModified: '2024-01-22T03:00:00Z',
    contentType: 'application/gzip',
    containsPII: true,
    description: 'Weekly database backup with user data'
  },
  {
    key: 'exports/customer-data-2024-01.csv',
    bucket: 'ghostprotocol-exports',
    size: 10485760, // 10 MB
    lastModified: '2024-01-31T12:00:00Z',
    contentType: 'text/csv',
    containsPII: true,
    description: 'Customer data export with emails and phone numbers'
  },
  {
    key: 'logs/application-2024-01-15.log.gz',
    bucket: 'ghostprotocol-logs',
    size: 104857600, // 100 MB
    lastModified: '2024-01-15T23:59:59Z',
    contentType: 'application/gzip',
    containsPII: true,
    description: 'Application logs that may contain user emails in error messages'
  },
  {
    key: 'logs/application-2024-01-20.log.gz',
    bucket: 'ghostprotocol-logs',
    size: 98304000, // 94 MB
    lastModified: '2024-01-20T23:59:59Z',
    contentType: 'application/gzip',
    containsPII: true,
    description: 'Application logs with potential PII in stack traces'
  },
  {
    key: 'analytics/user-events-2024-01.parquet',
    bucket: 'ghostprotocol-analytics',
    size: 209715200, // 200 MB
    lastModified: '2024-01-31T00:00:00Z',
    contentType: 'application/octet-stream',
    containsPII: true,
    description: 'Analytics events with user IDs and session data'
  },
  {
    key: 'support/ticket-attachments/2024-01/ticket-001-screenshot.png',
    bucket: 'ghostprotocol-support',
    size: 2097152, // 2 MB
    lastModified: '2024-01-10T14:30:00Z',
    contentType: 'image/png',
    containsPII: false,
    description: 'Support ticket screenshot (no PII visible)'
  },
  {
    key: 'support/ticket-attachments/2024-01/ticket-002-invoice.pdf',
    bucket: 'ghostprotocol-support',
    size: 524288, // 512 KB
    lastModified: '2024-01-12T09:15:00Z',
    contentType: 'application/pdf',
    containsPII: true,
    description: 'Invoice PDF containing customer name and address'
  },
  {
    key: 'cold-storage/archived-conversations-2023-Q4.json.gz',
    bucket: 'ghostprotocol-archive',
    size: 52428800, // 50 MB
    lastModified: '2024-01-01T00:00:00Z',
    contentType: 'application/gzip',
    containsPII: true,
    description: 'Archived customer conversations from Q4 2023'
  },
  {
    key: 'cold-storage/archived-conversations-2023-Q3.json.gz',
    bucket: 'ghostprotocol-archive',
    size: 48234496, // 46 MB
    lastModified: '2023-10-01T00:00:00Z',
    contentType: 'application/gzip',
    containsPII: true,
    description: 'Archived customer conversations from Q3 2023'
  }
]

/**
 * Sample CSV content for customer data export
 */
export const sampleCustomerCSV = `user_id,email,phone,name,created_at,last_login
user_alice_001,alice.johnson@example.com,+1-555-0101,Alice Johnson,2023-06-15T10:00:00Z,2024-01-20T14:30:00Z
user_bob_002,bob.smith@company.com,+1-555-0202,Bob Smith,2023-08-22T11:30:00Z,2023-12-10T09:15:00Z
user_carol_003,carol.williams@example.org,+44-20-7123-4567,Carol Williams,2023-03-10T08:00:00Z,2024-01-21T16:45:00Z
user_david_004,david.chen@startup.io,+1-555-0404,David Chen,2023-11-05T13:20:00Z,2024-01-19T11:00:00Z
user_emma_005,emma.garcia@example.com,+34-91-123-4567,Emma Garcia,2023-12-01T15:00:00Z,2024-01-08T12:30:00Z
user_frank_006,frank.mueller@example.de,+49-30-1234-5678,Frank Mueller,2023-05-20T09:30:00Z,2024-01-21T10:15:00Z
user_grace_007,grace.kim@example.com,+82-2-1234-5678,Grace Kim,2023-09-15T14:00:00Z,2024-01-18T13:45:00Z
user_henry_008,henry.brown@example.com,+1-555-0808,Henry Brown,2023-04-01T10:00:00Z,2023-06-15T11:00:00Z`

/**
 * Sample log entries that might contain PII
 */
export const sampleLogEntries = [
  {
    timestamp: '2024-01-15T10:30:15.234Z',
    level: 'ERROR',
    message: 'Authentication failed for user alice.johnson@example.com',
    userId: 'user_alice_001'
  },
  {
    timestamp: '2024-01-15T11:45:22.567Z',
    level: 'INFO',
    message: 'Password reset requested for bob.smith@company.com',
    userId: 'user_bob_002'
  },
  {
    timestamp: '2024-01-16T09:12:33.890Z',
    level: 'WARN',
    message: 'Multiple login attempts from IP 192.168.1.100 for user carol.williams@example.org',
    userId: 'user_carol_003'
  },
  {
    timestamp: '2024-01-16T14:20:45.123Z',
    level: 'ERROR',
    message: 'Payment processing failed for customer david.chen@startup.io (Stripe ID: cus_david_stripe_004)',
    userId: 'user_david_004'
  },
  {
    timestamp: '2024-01-17T08:30:12.456Z',
    level: 'INFO',
    message: 'User emma.garcia@example.com requested data export',
    userId: 'user_emma_005'
  }
]

/**
 * Sample archived conversation data
 */
export const sampleArchivedConversation = {
  conversationId: 'archived_conv_001',
  userId: 'user_alice_001',
  archivedAt: '2024-01-01T00:00:00Z',
  messages: [
    {
      timestamp: '2023-12-15T10:00:00Z',
      sender: 'user',
      text: 'Hi, I\'m Alice Johnson (alice.johnson@example.com) and I need help with my account.'
    },
    {
      timestamp: '2023-12-15T10:05:00Z',
      sender: 'agent',
      text: 'Hello Alice! I can help you. I see your phone number is +1-555-0101. Is that correct?'
    },
    {
      timestamp: '2023-12-15T10:07:00Z',
      sender: 'user',
      text: 'Yes, that\'s right. You can also reach me at alice.j@personal.com'
    }
  ]
}

/**
 * Get backup files that might contain data for a specific user
 */
export function getBackupFilesForUser(userId: string): BackupFile[] {
  // In a real implementation, this would scan file contents
  // For demo, return all files that contain PII
  return sampleBackupFiles.filter(file => file.containsPII)
}

/**
 * Simulate scanning a backup file for PII
 */
export function scanBackupFileForPII(fileKey: string, userIdentifiers: string[]): {
  found: boolean
  matches: Array<{ type: string; value: string; location: string }>
} {
  const file = sampleBackupFiles.find(f => f.key === fileKey)
  
  if (!file || !file.containsPII) {
    return { found: false, matches: [] }
  }

  // Simulate finding PII in the file
  const matches = []
  
  if (fileKey.includes('database-backup')) {
    matches.push(
      { type: 'email', value: userIdentifiers[0] || 'user@example.com', location: 'users.email' },
      { type: 'phone', value: '+1-555-0101', location: 'users.phone' },
      { type: 'name', value: 'User Name', location: 'users.full_name' }
    )
  } else if (fileKey.includes('customer-data')) {
    matches.push(
      { type: 'email', value: userIdentifiers[0] || 'user@example.com', location: 'row 42, column email' }
    )
  } else if (fileKey.includes('logs')) {
    matches.push(
      { type: 'email', value: userIdentifiers[0] || 'user@example.com', location: 'line 1234' }
    )
  }

  return {
    found: matches.length > 0,
    matches
  }
}

/**
 * Generate a sample backup file manifest
 */
export function generateBackupManifest() {
  return {
    manifestVersion: '1.0',
    generatedAt: new Date().toISOString(),
    totalFiles: sampleBackupFiles.length,
    totalSize: sampleBackupFiles.reduce((sum, file) => sum + file.size, 0),
    files: sampleBackupFiles.map(file => ({
      key: file.key,
      bucket: file.bucket,
      size: file.size,
      lastModified: file.lastModified,
      contentType: file.contentType,
      containsPII: file.containsPII
    }))
  }
}
