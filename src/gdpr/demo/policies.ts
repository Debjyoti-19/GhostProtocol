/**
 * Demo policy configurations for different jurisdictions
 * Demonstrates how GhostProtocol adapts to regional requirements
 */

export interface PolicyConfig {
  version: string
  jurisdiction: 'EU' | 'US' | 'OTHER'
  name: string
  description: string
  retentionRules: {
    system: string
    retentionDays: number
    priority: number
    notes?: string
  }[]
  legalHoldRules: {
    system: string
    conditions: string[]
    maxDuration: number
    notes?: string
  }[]
  zombieCheckInterval: number
  confidenceThresholds: {
    autoDelete: number
    manualReview: number
  }
  deletionTimeline: {
    identityCritical: number // hours
    nonCritical: number // hours
    backgroundScans: number // days
  }
  certificateRequirements: {
    includeDataLineage: boolean
    signCertificates: boolean
    retentionPeriod: number // days
  }
}

/**
 * EU GDPR Policy Configuration
 * Strictest requirements - 30 day response time, comprehensive deletion
 */
export const euGDPRPolicy: PolicyConfig = {
  version: '1.0.0',
  jurisdiction: 'EU',
  name: 'EU GDPR Compliance Policy',
  description: 'Policy configuration for European Union GDPR compliance with strict 30-day deletion requirements',
  retentionRules: [
    {
      system: 'stripe',
      retentionDays: 0,
      priority: 1,
      notes: 'Must be deleted immediately as identity-critical system'
    },
    {
      system: 'database',
      retentionDays: 0,
      priority: 2,
      notes: 'Core user data must be deleted immediately after Stripe'
    },
    {
      system: 'intercom',
      retentionDays: 0,
      priority: 3,
      notes: 'Customer conversations contain PII and must be deleted'
    },
    {
      system: 'sendgrid',
      retentionDays: 0,
      priority: 3,
      notes: 'Email marketing data must be deleted'
    },
    {
      system: 'crm',
      retentionDays: 0,
      priority: 3,
      notes: 'CRM records must be deleted'
    },
    {
      system: 'analytics',
      retentionDays: 0,
      priority: 4,
      notes: 'Analytics data must be anonymized or deleted'
    },
    {
      system: 's3_backups',
      retentionDays: 7,
      priority: 5,
      notes: 'Backups must be scanned and cleaned within 7 days'
    }
  ],
  legalHoldRules: [
    {
      system: 'financial_records',
      conditions: ['active_investigation', 'tax_audit', 'legal_dispute'],
      maxDuration: 2555, // 7 years
      notes: 'Financial records may be held for legal/tax purposes'
    },
    {
      system: 'fraud_prevention',
      conditions: ['fraud_investigation', 'security_incident'],
      maxDuration: 365, // 1 year
      notes: 'Fraud-related data may be retained for security purposes'
    }
  ],
  zombieCheckInterval: 30, // 30 days
  confidenceThresholds: {
    autoDelete: 0.85, // Higher threshold for EU
    manualReview: 0.6
  },
  deletionTimeline: {
    identityCritical: 24, // 24 hours
    nonCritical: 72, // 3 days
    backgroundScans: 7 // 7 days
  },
  certificateRequirements: {
    includeDataLineage: true,
    signCertificates: true,
    retentionPeriod: 2555 // 7 years
  }
}

/**
 * US CCPA Policy Configuration
 * More flexible than GDPR, allows for business necessity exemptions
 */
export const usCCPAPolicy: PolicyConfig = {
  version: '1.0.0',
  jurisdiction: 'US',
  name: 'US CCPA Compliance Policy',
  description: 'Policy configuration for California Consumer Privacy Act compliance with business necessity considerations',
  retentionRules: [
    {
      system: 'stripe',
      retentionDays: 0,
      priority: 1,
      notes: 'Payment data deleted unless under legal hold'
    },
    {
      system: 'database',
      retentionDays: 0,
      priority: 2,
      notes: 'User data deleted with business necessity exemptions'
    },
    {
      system: 'intercom',
      retentionDays: 7,
      priority: 3,
      notes: 'Support conversations may be retained for 7 days for quality assurance'
    },
    {
      system: 'sendgrid',
      retentionDays: 0,
      priority: 3,
      notes: 'Marketing data deleted immediately'
    },
    {
      system: 'crm',
      retentionDays: 30,
      priority: 3,
      notes: 'CRM data may be retained for 30 days for business operations'
    },
    {
      system: 'analytics',
      retentionDays: 90,
      priority: 4,
      notes: 'Anonymized analytics may be retained for 90 days'
    },
    {
      system: 's3_backups',
      retentionDays: 30,
      priority: 5,
      notes: 'Backups scanned and cleaned within 30 days'
    }
  ],
  legalHoldRules: [
    {
      system: 'financial_records',
      conditions: ['active_investigation', 'tax_audit', 'legal_dispute', 'regulatory_requirement'],
      maxDuration: 2555, // 7 years
      notes: 'Financial records retained for IRS and legal requirements'
    },
    {
      system: 'fraud_prevention',
      conditions: ['fraud_investigation', 'security_incident', 'law_enforcement_request'],
      maxDuration: 730, // 2 years
      notes: 'Fraud data retained for security and law enforcement'
    },
    {
      system: 'business_records',
      conditions: ['contract_dispute', 'warranty_claim'],
      maxDuration: 1825, // 5 years
      notes: 'Business records retained for contract enforcement'
    }
  ],
  zombieCheckInterval: 45, // 45 days
  confidenceThresholds: {
    autoDelete: 0.8,
    manualReview: 0.5
  },
  deletionTimeline: {
    identityCritical: 48, // 48 hours
    nonCritical: 168, // 7 days
    backgroundScans: 30 // 30 days
  },
  certificateRequirements: {
    includeDataLineage: true,
    signCertificates: true,
    retentionPeriod: 2555 // 7 years
  }
}

/**
 * Other Jurisdictions Policy Configuration
 * Flexible policy for regions without specific data protection laws
 */
export const otherJurisdictionsPolicy: PolicyConfig = {
  version: '1.0.0',
  jurisdiction: 'OTHER',
  name: 'General Data Protection Policy',
  description: 'Policy configuration for jurisdictions without specific GDPR/CCPA requirements',
  retentionRules: [
    {
      system: 'stripe',
      retentionDays: 0,
      priority: 1,
      notes: 'Payment data deleted as best practice'
    },
    {
      system: 'database',
      retentionDays: 0,
      priority: 2,
      notes: 'User data deleted upon request'
    },
    {
      system: 'intercom',
      retentionDays: 30,
      priority: 3,
      notes: 'Support data retained for 30 days'
    },
    {
      system: 'sendgrid',
      retentionDays: 14,
      priority: 3,
      notes: 'Email data retained for 14 days'
    },
    {
      system: 'crm',
      retentionDays: 90,
      priority: 3,
      notes: 'CRM data retained for 90 days'
    },
    {
      system: 'analytics',
      retentionDays: 180,
      priority: 4,
      notes: 'Analytics data retained for 180 days'
    },
    {
      system: 's3_backups',
      retentionDays: 90,
      priority: 5,
      notes: 'Backups cleaned within 90 days'
    }
  ],
  legalHoldRules: [
    {
      system: 'financial_records',
      conditions: ['active_investigation', 'tax_audit', 'legal_dispute'],
      maxDuration: 2555, // 7 years
      notes: 'Financial records retained for standard business practices'
    },
    {
      system: 'fraud_prevention',
      conditions: ['fraud_investigation', 'security_incident'],
      maxDuration: 1095, // 3 years
      notes: 'Fraud data retained for security purposes'
    }
  ],
  zombieCheckInterval: 60, // 60 days
  confidenceThresholds: {
    autoDelete: 0.75,
    manualReview: 0.45
  },
  deletionTimeline: {
    identityCritical: 72, // 72 hours
    nonCritical: 336, // 14 days
    backgroundScans: 90 // 90 days
  },
  certificateRequirements: {
    includeDataLineage: true,
    signCertificates: false,
    retentionPeriod: 1825 // 5 years
  }
}

/**
 * Get policy configuration by jurisdiction
 */
export function getPolicyByJurisdiction(jurisdiction: 'EU' | 'US' | 'OTHER'): PolicyConfig {
  switch (jurisdiction) {
    case 'EU':
      return euGDPRPolicy
    case 'US':
      return usCCPAPolicy
    case 'OTHER':
      return otherJurisdictionsPolicy
    default:
      return otherJurisdictionsPolicy
  }
}

/**
 * Compare policies to show differences
 */
export function comparePolicies(): {
  jurisdiction: string
  zombieCheckDays: number
  maxDeletionDays: number
  autoDeleteThreshold: number
}[] {
  return [
    {
      jurisdiction: 'EU (GDPR)',
      zombieCheckDays: euGDPRPolicy.zombieCheckInterval,
      maxDeletionDays: Math.ceil(euGDPRPolicy.deletionTimeline.backgroundScans),
      autoDeleteThreshold: euGDPRPolicy.confidenceThresholds.autoDelete
    },
    {
      jurisdiction: 'US (CCPA)',
      zombieCheckDays: usCCPAPolicy.zombieCheckInterval,
      maxDeletionDays: Math.ceil(usCCPAPolicy.deletionTimeline.backgroundScans),
      autoDeleteThreshold: usCCPAPolicy.confidenceThresholds.autoDelete
    },
    {
      jurisdiction: 'Other',
      zombieCheckDays: otherJurisdictionsPolicy.zombieCheckInterval,
      maxDeletionDays: Math.ceil(otherJurisdictionsPolicy.deletionTimeline.backgroundScans),
      autoDeleteThreshold: otherJurisdictionsPolicy.confidenceThresholds.autoDelete
    }
  ]
}

/**
 * Get all available policies
 */
export function getAllPolicies(): PolicyConfig[] {
  return [euGDPRPolicy, usCCPAPolicy, otherJurisdictionsPolicy]
}
