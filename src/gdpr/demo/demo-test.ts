/**
 * Quick test/verification script for demo data
 * Run this to verify all demo data is properly structured
 */

import {
  demoUsers,
  getDemoUser,
  slackExportMessages,
  intercomConversations,
  sampleBackupFiles,
  euGDPRPolicy,
  usCCPAPolicy,
  allScenarios,
  generateJudgeDemoScript,
  printDemoSummary,
  getDemoDataForScenario
} from './index.js'

/**
 * Verify demo data integrity
 */
function verifyDemoData() {
  console.log('🔍 Verifying GhostProtocol Demo Data...\n')

  let errors = 0

  // Verify users
  console.log('✓ Checking demo users...')
  if (demoUsers.length !== 8) {
    console.error(`  ❌ Expected 8 users, found ${demoUsers.length}`)
    errors++
  }

  demoUsers.forEach(user => {
    if (!user.identifiers.userId) {
      console.error(`  ❌ User missing userId: ${JSON.stringify(user)}`)
      errors++
    }
    if (!user.identifiers.emails || user.identifiers.emails.length === 0) {
      console.error(`  ❌ User missing emails: ${user.identifiers.userId}`)
      errors++
    }
    if (!user.jurisdiction) {
      console.error(`  ❌ User missing jurisdiction: ${user.identifiers.userId}`)
      errors++
    }
  })

  // Verify chat messages
  console.log('✓ Checking chat messages...')
  if (slackExportMessages.length !== 13) {
    console.error(`  ❌ Expected 13 messages, found ${slackExportMessages.length}`)
    errors++
  }

  const piiMessages = slackExportMessages.filter(m => m.containsPII)
  console.log(`  - Messages with PII: ${piiMessages.length}/${slackExportMessages.length}`)

  // Verify conversations
  console.log('✓ Checking Intercom conversations...')
  if (intercomConversations.length !== 3) {
    console.error(`  ❌ Expected 3 conversations, found ${intercomConversations.length}`)
    errors++
  }

  // Verify backup files
  console.log('✓ Checking backup files...')
  if (sampleBackupFiles.length !== 10) {
    console.error(`  ❌ Expected 10 backup files, found ${sampleBackupFiles.length}`)
    errors++
  }

  const backupsWithPII = sampleBackupFiles.filter(f => f.containsPII)
  console.log(`  - Files with PII: ${backupsWithPII.length}/${sampleBackupFiles.length}`)

  // Verify policies
  console.log('✓ Checking policies...')
  if (!euGDPRPolicy || !usCCPAPolicy) {
    console.error('  ❌ Missing policy configurations')
    errors++
  }

  if (euGDPRPolicy.zombieCheckInterval !== 30) {
    console.error(`  ❌ EU policy zombie check should be 30 days, found ${euGDPRPolicy.zombieCheckInterval}`)
    errors++
  }

  if (usCCPAPolicy.zombieCheckInterval !== 45) {
    console.error(`  ❌ US policy zombie check should be 45 days, found ${usCCPAPolicy.zombieCheckInterval}`)
    errors++
  }

  // Verify scenarios
  console.log('✓ Checking scenarios...')
  if (allScenarios.length !== 8) {
    console.error(`  ❌ Expected 8 scenarios, found ${allScenarios.length}`)
    errors++
  }

  allScenarios.forEach(scenario => {
    if (!scenario.id || !scenario.name || !scenario.user) {
      console.error(`  ❌ Scenario missing required fields: ${scenario.id}`)
      errors++
    }
    if (scenario.steps.length === 0) {
      console.error(`  ❌ Scenario has no steps: ${scenario.id}`)
      errors++
    }
  })

  // Verify demo data for scenarios
  console.log('✓ Checking scenario demo data...')
  const scenario1Data = getDemoDataForScenario('scenario_1')
  if (!scenario1Data || !scenario1Data.user) {
    console.error('  ❌ Failed to get demo data for scenario_1')
    errors++
  }

  // Verify judge script
  console.log('✓ Checking judge demo script...')
  const script = generateJudgeDemoScript()
  if (!script || script.length < 100) {
    console.error('  ❌ Judge demo script is too short or missing')
    errors++
  }

  // Summary
  console.log('\n' + '='.repeat(80))
  if (errors === 0) {
    console.log('✅ All demo data verified successfully!')
  } else {
    console.log(`❌ Found ${errors} error(s) in demo data`)
  }
  console.log('='.repeat(80) + '\n')

  return errors === 0
}

/**
 * Display sample data
 */
function displaySampleData() {
  console.log('\n' + '='.repeat(80))
  console.log('SAMPLE DEMO DATA')
  console.log('='.repeat(80) + '\n')

  // Sample user
  const alice = getDemoUser('user_alice_001')
  if (alice) {
    console.log('Sample User: Alice Johnson')
    console.log(`  - User ID: ${alice.identifiers.userId}`)
    console.log(`  - Emails: ${alice.identifiers.emails.join(', ')}`)
    console.log(`  - Phone: ${alice.identifiers.phones[0]}`)
    console.log(`  - Jurisdiction: ${alice.jurisdiction}`)
    console.log(`  - Conversations: ${alice.conversationCount}`)
    console.log(`  - Orders: ${alice.orderCount}`)
  }

  // Sample message
  const piiMessage = slackExportMessages.find(m => m.containsPII)
  if (piiMessage) {
    console.log('\nSample Chat Message:')
    console.log(`  - ID: ${piiMessage.id}`)
    console.log(`  - Channel: ${piiMessage.channel}`)
    console.log(`  - Text: "${piiMessage.text.substring(0, 80)}..."`)
    console.log(`  - PII Types: ${piiMessage.expectedPIITypes.join(', ')}`)
  }

  // Sample backup file
  const backupFile = sampleBackupFiles[0]
  console.log('\nSample Backup File:')
  console.log(`  - Key: ${backupFile.key}`)
  console.log(`  - Size: ${(backupFile.size / 1024 / 1024).toFixed(2)} MB`)
  console.log(`  - Contains PII: ${backupFile.containsPII}`)
  console.log(`  - Description: ${backupFile.description}`)

  // Sample policy
  console.log('\nSample Policy (EU GDPR):')
  console.log(`  - Zombie Check: ${euGDPRPolicy.zombieCheckInterval} days`)
  console.log(`  - Auto-delete Threshold: ${euGDPRPolicy.confidenceThresholds.autoDelete}`)
  console.log(`  - Retention Rules: ${euGDPRPolicy.retentionRules.length}`)

  // Sample scenario
  const scenario = allScenarios[0]
  console.log('\nSample Scenario:')
  console.log(`  - Name: ${scenario.name}`)
  console.log(`  - Duration: ${scenario.estimatedDuration}`)
  console.log(`  - Features: ${scenario.demonstratesFeatures.length}`)
  console.log(`  - Steps: ${scenario.steps.length}`)

  console.log('\n' + '='.repeat(80) + '\n')
}

/**
 * Main test function
 */
async function main() {
  console.log('\n🚀 GhostProtocol Demo Data Test\n')

  // Verify data integrity
  const isValid = verifyDemoData()

  if (isValid) {
    // Display sample data
    displaySampleData()

    // Print summary
    printDemoSummary()

    console.log('\n✅ Demo data is ready for use!')
    console.log('\nNext steps:')
    console.log('  1. Run: npm run demo:judge (for 60-second judge demo)')
    console.log('  2. Run: npm run demo:list (to see all scenarios)')
    console.log('  3. Import demo data in your code:')
    console.log('     import { demoUsers, allScenarios } from "./demo/index.js"')
  } else {
    console.log('\n❌ Demo data has errors. Please fix before using.')
    process.exit(1)
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { verifyDemoData, displaySampleData }
