/**
 * Seed Slack Test Data
 * 
 * Creates test messages in Slack channels for GDPR deletion testing.
 * Run: npx tsx scripts/seed-slack-data.ts
 */

import { config } from 'dotenv'
import { WebClient } from '@slack/web-api'

// Load environment variables
config()

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN

if (!SLACK_BOT_TOKEN) {
  console.error('❌ SLACK_BOT_TOKEN not set in environment')
  process.exit(1)
}

const slack = new WebClient(SLACK_BOT_TOKEN)

// Test user data - this simulates PII that should be detected and deleted
const TEST_USER = {
  email: 'gdpr.test@ghostprotocol.dev',
  phone: '+1-555-123-4567',
  name: 'John Doe',
  ssn: '123-45-6789',
  address: '123 Main Street, New York, NY 10001'
}

const TEST_USER_2 = {
  email: 'soumyadeepbhoumik@gmail.com',
  phone: '+1-666-555-4444',
  name: 'Soumyadeep Bhoumik',
  ssn: '987-65-4321',
  address: '789 Park Avenue, Mumbai, India'
}

const TEST_MESSAGES = [
  `Hey team, please contact me at ${TEST_USER.email} for the project details.`,
  `My phone number is ${TEST_USER.phone}, call me anytime!`,
  `This is ${TEST_USER.name} from the engineering team.`,
  `Please send the documents to my address: ${TEST_USER.address}`,
  `For verification, my SSN is ${TEST_USER.ssn} (don't share this!)`,
  `Meeting notes from today - nothing sensitive here.`,
  `The quarterly report is ready for review.`,
  `Can someone help me with the deployment?`,
  `My personal email for emergencies: ${TEST_USER.email}`,
  `Contact ${TEST_USER.name} at ${TEST_USER.phone} for urgent matters.`,
  `Also reach out to ${TEST_USER_2.name} at ${TEST_USER_2.email}`,
  `${TEST_USER_2.name}'s phone is ${TEST_USER_2.phone} for backup contact.`
]

async function seedSlackData() {
  console.log('🚀 Seeding Slack Test Data')
  console.log('='.repeat(50))

  try {
    // Get bot info
    const authResult = await slack.auth.test()
    console.log(`✅ Connected as: ${authResult.user} (${authResult.team})`)
    const botUserId = authResult.user_id

    // List channels the bot is in (public only to avoid needing groups:read scope)
    const channelsResult = await slack.conversations.list({
      types: 'public_channel',
      exclude_archived: true
    })

    if (!channelsResult.ok || !channelsResult.channels?.length) {
      console.log('❌ No channels found. Please invite the bot to a channel first.')
      console.log('\nTo invite the bot:')
      console.log('1. Go to a Slack channel')
      console.log('2. Type: /invite @YourBotName')
      return
    }

    // Find a channel to post test messages
    const targetChannel = channelsResult.channels.find(ch => ch.is_member)
      || channelsResult.channels[0]

    if (!targetChannel?.id) {
      console.log('❌ Bot is not a member of any channel')
      console.log('\nPlease invite the bot to a channel first')
      return
    }

    console.log(`\n📢 Target channel: #${targetChannel.name} (${targetChannel.id})`)

    // Check if bot is a member
    if (!targetChannel.is_member) {
      console.log('⚠️  Bot is not a member of this channel. Attempting to join...')
      try {
        await slack.conversations.join({ channel: targetChannel.id })
        console.log('✅ Joined channel successfully')
      } catch (joinErr: any) {
        console.log(`❌ Could not join channel: ${joinErr.message}`)
        console.log('Please manually invite the bot to the channel')
        return
      }
    }

    // Post test messages
    console.log('\n📝 Posting test messages with PII...\n')

    const postedMessages: string[] = []

    for (let i = 0; i < TEST_MESSAGES.length; i++) {
      const message = TEST_MESSAGES[i]
      try {
        const result = await slack.chat.postMessage({
          channel: targetChannel.id,
          text: message
        })

        if (result.ok && result.ts) {
          postedMessages.push(result.ts)
          const preview = message.length > 50 ? message.slice(0, 50) + '...' : message
          console.log(`  ✅ Message ${i + 1}: "${preview}"`)
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500))
      } catch (err: any) {
        console.log(`  ❌ Failed to post message ${i + 1}: ${err.message}`)
      }
    }

    console.log('\n' + '='.repeat(50))
    console.log('📊 Summary:')
    console.log(`   Messages posted: ${postedMessages.length}`)
    console.log(`   Channel: #${targetChannel.name}`)
    console.log(`   Bot User ID: ${botUserId}`)

    console.log('\n🧪 Test User Data:')
    console.log(`   Email: ${TEST_USER.email}`)
    console.log(`   Phone: ${TEST_USER.phone}`)
    console.log(`   Name: ${TEST_USER.name}`)

    console.log('\n📋 To test GDPR deletion, use this curl command:')
    console.log(`
curl -X POST http://localhost:3000/erasure-request \\
  -H "Content-Type: application/json" \\
  -d '{
    "userIdentifiers": {
      "userId": "slack_test_user",
      "emails": ["${TEST_USER.email}"],
      "phones": ["${TEST_USER.phone}"],
      "aliases": ["${TEST_USER.name}"]
    },
    "legalProof": {
      "type": "SIGNED_REQUEST",
      "evidence": "Digital signature",
      "verifiedAt": "${new Date().toISOString()}"
    },
    "jurisdiction": "EU"
  }'
`)

    console.log('\n✅ Slack test data seeded successfully!')
    console.log('   The AI agent will scan these messages for PII during deletion.')

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.data) {
      console.error('   Details:', JSON.stringify(error.data, null, 2))
    }
  }
}

seedSlackData()
