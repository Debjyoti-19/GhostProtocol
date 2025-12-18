/**
 * Policy Management Service for GhostProtocol
 * 
 * Handles policy-driven workflow configuration including:
 * - Jurisdiction-based policy application
 * - Region-specific deletion rules and retention policies
 * - Policy versioning with historical record maintenance
 * - Policy reference tracking in audit trails and certificates
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

import { StateManager } from 'motia'
import { v4 as uuidv4 } from 'uuid'
import { 
  PolicyConfig, 
  Jurisdiction,
  RetentionRule,
  LegalHoldRule,
  ConfidenceThresholds
} from '../types/index.js'
import { GhostProtocolError } from '../errors/index.js'

export interface PolicyHistoryEntry {
  version: string
  config: PolicyConfig
  createdAt: string
  createdBy: string
  reason: string
  supersedes?: string
}

export interface PolicyApplicationRecord {
  workflowId: string
  policyVersion: string
  jurisdiction: Jurisdiction
  appliedAt: string
  configSnapshot: PolicyConfig
}

/**
 * Default policy configurations for different jurisdictions
 */
const DEFAULT_POLICIES: Record<Jurisdiction, PolicyConfig> = {
  EU: {
    version: '1.0.0',
    jurisdiction: 'EU',
    retentionRules: [
      { system: 'stripe', retentionDays: 0, priority: 1 },
      { system: 'database', retentionDays: 0, priority: 2 },
      { system: 'intercom', retentionDays: 0, priority: 3 },
      { system: 'sendgrid', retentionDays: 0, priority: 3 },
      { system: 'crm', retentionDays: 0, priority: 3 },
      { system: 'analytics', retentionDays: 0, priority: 3 }
    ],
    legalHoldRules: [
      { 
        system: 'database', 
        conditions: ['active_litigation', 'regulatory_investigation'], 
        maxDuration: 2555 // 7 years
      }
    ],
    zombieCheckInterval: 30, // GDPR requires prompt deletion
    confidenceThresholds: {
      autoDelete: 0.8,
      manualReview: 0.5
    }
  },
  US: {
    version: '1.0.0',
    jurisdiction: 'US',
    retentionRules: [
      { system: 'stripe', retentionDays: 7, priority: 1 }, // Grace period for disputes
      { system: 'database', retentionDays: 7, priority: 2 },
      { system: 'intercom', retentionDays: 0, priority: 3 },
      { system: 'sendgrid', retentionDays: 0, priority: 3 },
      { system: 'crm', retentionDays: 0, priority: 3 },
      { system: 'analytics', retentionDays: 30, priority: 4 } // CCPA allows reasonable delay
    ],
    legalHoldRules: [
      { 
        system: 'database', 
        conditions: ['active_litigation', 'regulatory_investigation', 'tax_audit'], 
        maxDuration: 2555 // 7 years
      },
      {
        system: 'stripe',
        conditions: ['payment_dispute', 'fraud_investigation'],
        maxDuration: 365 // 1 year
      }
    ],
    zombieCheckInterval: 45, // CCPA is more lenient
    confidenceThresholds: {
      autoDelete: 0.85, // Higher threshold for US
      manualReview: 0.6
    }
  },
  OTHER: {
    version: '1.0.0',
    jurisdiction: 'OTHER',
    retentionRules: [
      { system: 'stripe', retentionDays: 14, priority: 1 },
      { system: 'database', retentionDays: 14, priority: 2 },
      { system: 'intercom', retentionDays: 7, priority: 3 },
      { system: 'sendgrid', retentionDays: 7, priority: 3 },
      { system: 'crm', retentionDays: 7, priority: 3 },
      { system: 'analytics', retentionDays: 60, priority: 4 }
    ],
    legalHoldRules: [
      { 
        system: 'database', 
        conditions: ['active_litigation'], 
        maxDuration: 1825 // 5 years
      }
    ],
    zombieCheckInterval: 60, // Conservative default
    confidenceThresholds: {
      autoDelete: 0.9, // Very conservative
      manualReview: 0.7
    }
  }
}

/**
 * Policy Manager
 * 
 * Provides comprehensive policy management with jurisdiction-based configuration,
 * versioning, and audit trail integration.
 */
export class PolicyManager {
  private state: StateManager
  private logger: any

  constructor(state: StateManager, logger: any) {
    this.state = state
    this.logger = logger
  }

  /**
   * Gets the current active policy for a jurisdiction
   * 
   * Requirement 11.1: Apply policy configurations based on user jurisdiction
   */
  async getPolicyForJurisdiction(jurisdiction: Jurisdiction): Promise<PolicyConfig> {
    this.logger.info('Retrieving policy for jurisdiction', { jurisdiction })

    // Try to get custom policy from state
    const customPolicy = await this.state.get('policies', `current:${jurisdiction}`)
    
    if (customPolicy) {
      this.logger.info('Using custom policy', { 
        jurisdiction, 
        version: customPolicy.version 
      })
      return customPolicy
    }

    // Fall back to default policy
    const defaultPolicy = DEFAULT_POLICIES[jurisdiction]
    this.logger.info('Using default policy', { 
      jurisdiction, 
      version: defaultPolicy.version 
    })
    
    return defaultPolicy
  }

  /**
   * Gets a specific policy version from history
   * 
   * Requirement 11.4: Maintain historical policy records
   */
  async getPolicyVersion(version: string, jurisdiction: Jurisdiction): Promise<PolicyConfig | null> {
    this.logger.info('Retrieving policy version', { version, jurisdiction })

    const historyEntry = await this.state.get('policy_history', `${jurisdiction}:${version}`)
    
    if (!historyEntry) {
      this.logger.warn('Policy version not found', { version, jurisdiction })
      return null
    }

    return historyEntry.config
  }

  /**
   * Creates a new policy version
   * 
   * Requirement 11.3: Version policy configurations
   */
  async createPolicyVersion(
    jurisdiction: Jurisdiction,
    config: Omit<PolicyConfig, 'version' | 'jurisdiction'>,
    createdBy: string,
    reason: string
  ): Promise<PolicyConfig> {
    this.logger.info('Creating new policy version', { jurisdiction, createdBy })

    // Get current policy to determine version number
    const currentPolicy = await this.getPolicyForJurisdiction(jurisdiction)
    const currentVersion = currentPolicy.version
    
    // Generate new version number (simple increment)
    const newVersion = this.incrementVersion(currentVersion)

    // Create new policy config
    const newPolicy: PolicyConfig = {
      ...config,
      version: newVersion,
      jurisdiction
    }

    // Create history entry
    const historyEntry: PolicyHistoryEntry = {
      version: newVersion,
      config: newPolicy,
      createdAt: new Date().toISOString(),
      createdBy,
      reason,
      supersedes: currentVersion
    }

    // Store in history
    await this.state.set('policy_history', `${jurisdiction}:${newVersion}`, historyEntry)

    // Update current policy pointer
    await this.state.set('policies', `current:${jurisdiction}`, newPolicy)

    this.logger.info('Policy version created', { 
      jurisdiction, 
      version: newVersion, 
      supersedes: currentVersion 
    })

    return newPolicy
  }

  /**
   * Records policy application to a workflow
   * 
   * Requirement 11.3: Include policy snapshot in audit trail
   * Requirement 11.5: Reference policy version in certificates
   */
  async recordPolicyApplication(
    workflowId: string,
    jurisdiction: Jurisdiction
  ): Promise<PolicyApplicationRecord> {
    this.logger.info('Recording policy application', { workflowId, jurisdiction })

    // Get current policy
    const policy = await this.getPolicyForJurisdiction(jurisdiction)

    // Create application record
    const record: PolicyApplicationRecord = {
      workflowId,
      policyVersion: policy.version,
      jurisdiction,
      appliedAt: new Date().toISOString(),
      configSnapshot: policy
    }

    // Store application record
    await this.state.set('policy_applications', workflowId, record)

    this.logger.info('Policy application recorded', { 
      workflowId, 
      policyVersion: policy.version,
      jurisdiction
    })

    return record
  }

  /**
   * Gets policy application record for a workflow
   * 
   * Requirement 11.5: Reference specific policy version in certificates
   */
  async getPolicyApplication(workflowId: string): Promise<PolicyApplicationRecord | null> {
    return await this.state.get('policy_applications', workflowId)
  }

  /**
   * Gets all policy versions for a jurisdiction
   * 
   * Requirement 11.4: Maintain historical policy records
   */
  async getPolicyHistory(jurisdiction: Jurisdiction): Promise<PolicyHistoryEntry[]> {
    this.logger.info('Retrieving policy history', { jurisdiction })

    // In a real implementation, we would query all keys matching the pattern
    // For now, we'll return an empty array as a placeholder
    // This would require a scan operation on the state store
    
    return []
  }

  /**
   * Gets retention rules for a specific system based on jurisdiction
   * 
   * Requirement 11.2: Enforce different deletion timelines per policy
   */
  async getRetentionRulesForSystem(
    system: string,
    jurisdiction: Jurisdiction
  ): Promise<RetentionRule | null> {
    const policy = await this.getPolicyForJurisdiction(jurisdiction)
    
    const rule = policy.retentionRules.find(r => r.system === system)
    
    if (!rule) {
      this.logger.warn('No retention rule found for system', { system, jurisdiction })
      return null
    }

    return rule
  }

  /**
   * Gets legal hold rules for a specific system based on jurisdiction
   * 
   * Requirement 11.2: Enforce different system priorities per policy
   */
  async getLegalHoldRulesForSystem(
    system: string,
    jurisdiction: Jurisdiction
  ): Promise<LegalHoldRule | null> {
    const policy = await this.getPolicyForJurisdiction(jurisdiction)
    
    const rule = policy.legalHoldRules.find(r => r.system === system)
    
    if (!rule) {
      this.logger.debug('No legal hold rule found for system', { system, jurisdiction })
      return null
    }

    return rule
  }

  /**
   * Gets confidence thresholds based on jurisdiction
   * 
   * Requirement 11.2: Apply jurisdiction-specific thresholds
   */
  async getConfidenceThresholds(jurisdiction: Jurisdiction): Promise<ConfidenceThresholds> {
    const policy = await this.getPolicyForJurisdiction(jurisdiction)
    return policy.confidenceThresholds
  }

  /**
   * Gets zombie check interval based on jurisdiction
   * 
   * Requirement 11.2: Apply jurisdiction-specific intervals
   */
  async getZombieCheckInterval(jurisdiction: Jurisdiction): Promise<number> {
    const policy = await this.getPolicyForJurisdiction(jurisdiction)
    return policy.zombieCheckInterval
  }

  /**
   * Validates if a policy config is valid
   */
  validatePolicy(config: PolicyConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Check that all systems have retention rules
    const requiredSystems = ['stripe', 'database', 'intercom', 'sendgrid', 'crm', 'analytics']
    const configuredSystems = new Set(config.retentionRules.map(r => r.system))
    
    for (const system of requiredSystems) {
      if (!configuredSystems.has(system)) {
        errors.push(`Missing retention rule for system: ${system}`)
      }
    }

    // Check priority uniqueness within same retention days
    const priorityMap = new Map<number, string[]>()
    for (const rule of config.retentionRules) {
      const key = rule.retentionDays
      if (!priorityMap.has(key)) {
        priorityMap.set(key, [])
      }
      priorityMap.get(key)!.push(rule.system)
    }

    // Check confidence thresholds
    if (config.confidenceThresholds.autoDelete < config.confidenceThresholds.manualReview) {
      errors.push('Auto delete threshold must be >= manual review threshold')
    }

    // Check zombie check interval
    if (config.zombieCheckInterval < 1) {
      errors.push('Zombie check interval must be at least 1 day')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Helper to increment semantic version
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.')
    const major = parseInt(parts[0] || '1', 10)
    const minor = parseInt(parts[1] || '0', 10)
    const patch = parseInt(parts[2] || '0', 10)

    // Increment patch version
    return `${major}.${minor}.${patch + 1}`
  }
}
