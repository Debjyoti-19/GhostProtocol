/**
 * Tests for GhostProtocol demo data
 */

import { describe, it, expect } from 'vitest'
import {
  demoUsers,
  getDemoUser,
  slackExportMessages,
  intercomConversations,
  sampleBackupFiles,
  euGDPRPolicy,
  usCCPAPolicy,
  otherJurisdictionsPolicy,
  allScenarios,
  getDemoDataForScenario,
  generateJudgeDemoScript,
  comparePolicies
} from '../../../src/gdpr/demo/index.js'

describe('Demo Users', () => {
  it('should have 8 demo users', () => {
    expect(demoUsers).toHaveLength(8)
  })

  it('should have users from different jurisdictions', () => {
    const euUsers = demoUsers.filter(u => u.jurisdiction === 'EU')
    const usUsers = demoUsers.filter(u => u.jurisdiction === 'US')
    const otherUsers = demoUsers.filter(u => u.jurisdiction === 'OTHER')

    expect(euUsers.length).toBeGreaterThan(0)
    expect(usUsers.length).toBeGreaterThan(0)
    expect(otherUsers.length).toBeGreaterThan(0)
  })

  it('should get user by ID', () => {
    const alice = getDemoUser('user_alice_001')
    expect(alice).toBeDefined()
    expect(alice?.identifiers.userId).toBe('user_alice_001')
    expect(alice?.identifiers.emails).toContain('alice.johnson@example.com')
  })

  it('should have valid user identifiers', () => {
    demoUsers.forEach(user => {
      expect(user.identifiers.userId).toBeTruthy()
      expect(user.identifiers.emails.length).toBeGreaterThan(0)
      expect(user.identifiers.phones.length).toBeGreaterThan(0)
      expect(user.jurisdiction).toMatch(/^(EU|US|OTHER)$/)
    })
  })
})

describe('Chat Export Data', () => {
  it('should have 13 Slack messages', () => {
    expect(slackExportMessages).toHaveLength(13)
  })

  it('should have messages with and without PII', () => {
    const withPII = slackExportMessages.filter(m => m.containsPII)
    const withoutPII = slackExportMessages.filter(m => !m.containsPII)

    expect(withPII.length).toBeGreaterThan(0)
    expect(withoutPII.length).toBeGreaterThan(0)
  })

  it('should have 3 Intercom conversations', () => {
    expect(intercomConversations).toHaveLength(3)
  })

  it('should have valid message structure', () => {
    slackExportMessages.forEach(msg => {
      expect(msg.id).toBeTruthy()
      expect(msg.timestamp).toBeTruthy()
      expect(msg.sender).toBeTruthy()
      expect(msg.text).toBeTruthy()
      expect(Array.isArray(msg.expectedPIITypes)).toBe(true)
    })
  })
})

describe('Backup Files', () => {
  it('should have 10 backup files', () => {
    expect(sampleBackupFiles).toHaveLength(10)
  })

  it('should have files with and without PII', () => {
    const withPII = sampleBackupFiles.filter(f => f.containsPII)
    const withoutPII = sampleBackupFiles.filter(f => !f.containsPII)

    expect(withPII.length).toBeGreaterThan(0)
    expect(withoutPII.length).toBeGreaterThan(0)
  })

  it('should have valid file structure', () => {
    sampleBackupFiles.forEach(file => {
      expect(file.key).toBeTruthy()
      expect(file.bucket).toBeTruthy()
      expect(file.size).toBeGreaterThan(0)
      expect(file.lastModified).toBeTruthy()
      expect(file.contentType).toBeTruthy()
    })
  })

  it('should have realistic file sizes', () => {
    const totalSize = sampleBackupFiles.reduce((sum, f) => sum + f.size, 0)
    const totalGB = totalSize / 1024 / 1024 / 1024

    expect(totalGB).toBeGreaterThan(0.5) // At least 500 MB total
    expect(totalGB).toBeLessThan(5) // Less than 5 GB total
  })
})

describe('Policy Configurations', () => {
  it('should have EU GDPR policy', () => {
    expect(euGDPRPolicy).toBeDefined()
    expect(euGDPRPolicy.jurisdiction).toBe('EU')
    expect(euGDPRPolicy.zombieCheckInterval).toBe(30)
    expect(euGDPRPolicy.confidenceThresholds.autoDelete).toBe(0.85)
  })

  it('should have US CCPA policy', () => {
    expect(usCCPAPolicy).toBeDefined()
    expect(usCCPAPolicy.jurisdiction).toBe('US')
    expect(usCCPAPolicy.zombieCheckInterval).toBe(45)
    expect(usCCPAPolicy.confidenceThresholds.autoDelete).toBe(0.80)
  })

  it('should have Other jurisdictions policy', () => {
    expect(otherJurisdictionsPolicy).toBeDefined()
    expect(otherJurisdictionsPolicy.jurisdiction).toBe('OTHER')
    expect(otherJurisdictionsPolicy.zombieCheckInterval).toBe(60)
    expect(otherJurisdictionsPolicy.confidenceThresholds.autoDelete).toBe(0.75)
  })

  it('should have different zombie check intervals', () => {
    expect(euGDPRPolicy.zombieCheckInterval).toBeLessThan(usCCPAPolicy.zombieCheckInterval)
    expect(usCCPAPolicy.zombieCheckInterval).toBeLessThan(otherJurisdictionsPolicy.zombieCheckInterval)
  })

  it('should have different confidence thresholds', () => {
    expect(euGDPRPolicy.confidenceThresholds.autoDelete).toBeGreaterThan(usCCPAPolicy.confidenceThresholds.autoDelete)
    expect(usCCPAPolicy.confidenceThresholds.autoDelete).toBeGreaterThan(otherJurisdictionsPolicy.confidenceThresholds.autoDelete)
  })

  it('should compare policies correctly', () => {
    const comparison = comparePolicies()
    expect(comparison).toHaveLength(3)
    expect(comparison[0].jurisdiction).toContain('EU')
    expect(comparison[1].jurisdiction).toContain('US')
    expect(comparison[2].jurisdiction).toContain('Other')
  })
})

describe('Demo Scenarios', () => {
  it('should have 8 scenarios', () => {
    expect(allScenarios).toHaveLength(8)
  })

  it('should have valid scenario structure', () => {
    allScenarios.forEach(scenario => {
      expect(scenario.id).toBeTruthy()
      expect(scenario.name).toBeTruthy()
      expect(scenario.description).toBeTruthy()
      expect(scenario.user).toBeDefined()
      expect(scenario.expectedOutcome).toBeTruthy()
      expect(scenario.demonstratesFeatures.length).toBeGreaterThan(0)
      expect(scenario.steps.length).toBeGreaterThan(0)
    })
  })

  it('should get demo data for scenario', () => {
    const data = getDemoDataForScenario('scenario_1')
    expect(data).toBeDefined()
    expect(data?.user).toBeDefined()
    expect(data?.policy).toBeDefined()
  })

  it('should generate judge demo script', () => {
    const script = generateJudgeDemoScript()
    expect(script).toBeTruthy()
    expect(script.length).toBeGreaterThan(100)
    expect(script).toContain('GhostProtocol')
    expect(script).toContain('60 Second')
  })

  it('should have scenarios covering key features', () => {
    const allFeatures = allScenarios.flatMap(s => s.demonstratesFeatures)
    
    expect(allFeatures.some(f => f.toLowerCase().includes('sequential'))).toBe(true)
    expect(allFeatures.some(f => f.toLowerCase().includes('parallel'))).toBe(true)
    expect(allFeatures.some(f => f.toLowerCase().includes('pii'))).toBe(true)
    expect(allFeatures.some(f => f.toLowerCase().includes('zombie'))).toBe(true)
    expect(allFeatures.some(f => f.toLowerCase().includes('legal hold'))).toBe(true)
    expect(allFeatures.some(f => f.toLowerCase().includes('certificate'))).toBe(true)
  })
})

describe('Demo Data Integration', () => {
  it('should have consistent user references across data sources', () => {
    // Check that users referenced in scenarios exist
    allScenarios.forEach(scenario => {
      const userId = scenario.user.identifiers.userId
      const user = getDemoUser(userId)
      expect(user).toBeDefined()
    })
  })

  it('should have Alice as the primary demo user', () => {
    const alice = getDemoUser('user_alice_001')
    expect(alice).toBeDefined()
    expect(alice?.jurisdiction).toBe('EU')
    expect(alice?.hasActiveSubscription).toBe(true)
    expect(alice?.conversationCount).toBeGreaterThan(0)
  })

  it('should have Henry as the zombie data scenario user', () => {
    const henry = getDemoUser('user_henry_008')
    expect(henry).toBeDefined()
    expect(henry?.description.toLowerCase()).toContain('zombie')
    expect(henry?.conversationCount).toBe(0)
    expect(henry?.orderCount).toBe(0)
  })

  it('should have Carol as the PII-heavy user', () => {
    const carol = getDemoUser('user_carol_003')
    expect(carol).toBeDefined()
    expect(carol?.conversationCount).toBeGreaterThan(20)
    expect(carol?.identifiers.emails.length).toBeGreaterThan(2)
  })
})
