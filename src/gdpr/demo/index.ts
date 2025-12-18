/**
 * GhostProtocol Demo Data and Scenarios
 * 
 * This module provides comprehensive demo data for showcasing GhostProtocol's
 * GDPR/CCPA erasure capabilities to judges and stakeholders.
 */

// Export sample users
export {
  demoUsers,
  getDemoUser,
  getDemoUsersByJurisdiction,
  getRandomDemoUser,
  type DemoUser
} from './sample-users.js'

// Export chat and message data
export {
  slackExportMessages,
  intercomConversations,
  supportTickets,
  getMessagesForUser,
  getConversationsForUser,
  exportChatDataAsJSON,
  type ChatMessage
} from './chat-exports.js'

// Export backup file data
export {
  sampleBackupFiles,
  sampleCustomerCSV,
  sampleLogEntries,
  sampleArchivedConversation,
  getBackupFilesForUser,
  scanBackupFileForPII,
  generateBackupManifest,
  type BackupFile
} from './backup-files.js'

// Export policy configurations
export {
  euGDPRPolicy,
  usCCPAPolicy,
  otherJurisdictionsPolicy,
  getPolicyByJurisdiction,
  comparePolicies,
  getAllPolicies,
  type PolicyConfig
} from './policies.js'

// Export demo scenarios
export {
  scenario1_HappyPath,
  scenario2_PartialCompletion,
  scenario3_PIIDetection,
  scenario4_BackgroundScanning,
  scenario5_ZombieDetection,
  scenario6_LegalHold,
  scenario7_PolicyComparison,
  scenario8_RealtimeMonitoring,
  allScenarios,
  getScenarioById,
  getScenariosByFeature,
  generateJudgeDemoScript,
  generateDetailedWalkthrough,
  type DemoScenario
} from './scenarios.js'

// Import dependencies at the top
import { demoUsers } from './sample-users.js'
import { euGDPRPolicy, usCCPAPolicy, otherJurisdictionsPolicy } from './policies.js'
import { intercomConversations, slackExportMessages } from './chat-exports.js'
import { sampleBackupFiles } from './backup-files.js'

/**
 * Quick start function to get demo data for a specific scenario
 */
export function getDemoDataForScenario(scenarioId: string) {
  const scenarios = {
    scenario_1: {
      user: demoUsers[0], // Alice
      policy: euGDPRPolicy,
      chatMessages: getMessagesForUser('alice'),
      backupFiles: getBackupFilesForUser('user_alice_001')
    },
    scenario_2: {
      user: demoUsers[1], // Bob
      policy: usCCPAPolicy,
      chatMessages: getMessagesForUser('bob'),
      backupFiles: getBackupFilesForUser('user_bob_002')
    },
    scenario_3: {
      user: demoUsers[2], // Carol
      policy: euGDPRPolicy,
      chatMessages: getMessagesForUser('carol'),
      conversations: intercomConversations.filter(c => c.userId === 'user_carol_003')
    },
    scenario_4: {
      user: demoUsers[3], // David
      policy: usCCPAPolicy,
      backupFiles: sampleBackupFiles.filter(f => f.containsPII)
    },
    scenario_5: {
      user: demoUsers[7], // Henry (zombie)
      policy: usCCPAPolicy,
      chatMessages: getMessagesForUser('henry')
    },
    scenario_6: {
      user: demoUsers[5], // Frank
      policy: euGDPRPolicy,
      chatMessages: getMessagesForUser('frank')
    },
    scenario_7: {
      user: demoUsers[0], // Alice (for comparison)
      policies: [euGDPRPolicy, usCCPAPolicy, otherJurisdictionsPolicy]
    },
    scenario_8: {
      user: demoUsers[2], // Carol (for visual complexity)
      policy: euGDPRPolicy,
      chatMessages: getMessagesForUser('carol'),
      conversations: intercomConversations
    }
  }

  return scenarios[scenarioId as keyof typeof scenarios] || null
}

/**
 * Generate a complete demo data package
 */
export function generateCompleteDemoPackage() {
  return {
    users: demoUsers,
    chatData: {
      slackMessages: slackExportMessages,
      intercomConversations,
      supportTickets
    },
    backupFiles: {
      files: sampleBackupFiles,
      manifest: generateBackupManifest(),
      sampleCSV: sampleCustomerCSV,
      sampleLogs: sampleLogEntries
    },
    policies: {
      eu: euGDPRPolicy,
      us: usCCPAPolicy,
      other: otherJurisdictionsPolicy,
      comparison: comparePolicies()
    },
    scenarios: allScenarios,
    demoScript: generateJudgeDemoScript(),
    walkthrough: generateDetailedWalkthrough()
  }
}

/**
 * Helper to print demo summary
 */
export function printDemoSummary() {
  console.log('=== GhostProtocol Demo Data Summary ===\n')
  console.log(`Total Demo Users: ${demoUsers.length}`)
  console.log(`  - EU Users: ${demoUsers.filter(u => u.jurisdiction === 'EU').length}`)
  console.log(`  - US Users: ${demoUsers.filter(u => u.jurisdiction === 'US').length}`)
  console.log(`  - Other: ${demoUsers.filter(u => u.jurisdiction === 'OTHER').length}\n`)
  
  console.log(`Chat Messages: ${slackExportMessages.length}`)
  console.log(`  - With PII: ${slackExportMessages.filter(m => m.containsPII).length}`)
  console.log(`  - Without PII: ${slackExportMessages.filter(m => !m.containsPII).length}\n`)
  
  console.log(`Intercom Conversations: ${intercomConversations.length}\n`)
  
  console.log(`Backup Files: ${sampleBackupFiles.length}`)
  console.log(`  - With PII: ${sampleBackupFiles.filter(f => f.containsPII).length}`)
  console.log(`  - Total Size: ${(sampleBackupFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024 / 1024).toFixed(2)} GB\n`)
  
  console.log(`Policy Configurations: 3 (EU, US, Other)\n`)
  
  console.log(`Demo Scenarios: ${allScenarios.length}`)
  allScenarios.forEach((scenario, i) => {
    console.log(`  ${i + 1}. ${scenario.name} (${scenario.estimatedDuration})`)
  })
  
  console.log('\n=== Ready for Demo! ===')
}

// Import helper functions (already imported above)
import { getMessagesForUser, getConversationsForUser } from './chat-exports.js'
import { getBackupFilesForUser, generateBackupManifest } from './backup-files.js'
