/**
 * Test Slack Deletion with AI-Powered PII Detection
 * 
 * This script:
 * 1. Posts test messages with PII to a Slack channel
 * 2. Scans all messages using AI (Groq) to detect PII
 * 3. Deletes bot's own messages containing PII
 * 4. Reports messages by others that need manual deletion
 * 
 * Run: npx tsx scripts/test-slack-ai.ts
 */

import { config } from 'dotenv'
config()

const TEST_USER = {
  userId: 'gdpr_e2e_test_user data',
  email: 'gdpr.e2e.test@ghostprotocol.dev',
  phone: '+1-555-E2E-TEST',
  name: 'Slack Test User',
  aliases: ['Slack Test User', 'slack_tester']
}

function log(emoji: string, message: string, data?: any) {
  console.log(`${emoji} ${message}`)
  if (data) console.log('   ', JSON.stringify(data, null, 2).split('\n').join('\n    '))
}

function separator(title: string) {
  console.log('\n' + '='.repeat(60))
  console.log(`  ${title}`)
  console.log('='.repeat(60))
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log('\n')
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║   SLACK AI-POWERED PII DELETION TEST                     ║')
  console.log('║   GhostProtocol - Intelligent Message Scanning           ║')
  console.log('╚══════════════════════════════════════════════════════════╝')

  const slackToken = process.env.SLACK_BOT_TOKEN
  const groqApiKey = process.env.GROQ_API_KEY

  if (!slackToken) {
    log('❌', 'SLACK_BOT_TOKEN not set in .env')
    process.exit(1)
  }

  log('✅', 'Slack token found')
  log(groqApiKey ? '✅' : '⚠️', groqApiKey ? 'Groq API key found - using AI detection' : 'No Groq API key - using regex fallback')

  const { WebClient } = await import('@slack/web-api')
  const slack = new WebClient(slackToken)

  // Get bot info
  const authResult = await slack.auth.test()
  const botUserId = authResult.user_id
  log('🤖', 'Bot authenticated', { botUserId, team: authResult.team })

  // ============================================
  // PHASE 1: SEED TEST MESSAGES
  // ============================================
  separator('PHASE 1: SEEDING TEST MESSAGES')

  // Find a channel the bot is in
  const channelsResult = await slack.conversations.list({
    types: 'public_channel',
    exclude_archived: true
  })

  const channel = channelsResult.channels?.find(c => c.is_member)
  if (!channel?.id) {
    log('❌', 'No accessible channel found. Invite the bot to a channel first.')
    process.exit(1)
  }

  log('📢', `Using channel: #${channel.name}`, { channelId: channel.id })

  // Post test messages with PII
  const testMessages = [
    `🧪 AI Test: Contact ${TEST_USER.name} at ${TEST_USER.email} for support`,
    `🧪 AI Test: User phone number is ${TEST_USER.phone}`,
    `🧪 AI Test: Account ID ${TEST_USER.userId} needs review`,
    `🧪 AI Test: This message has no PII - just a regular update`,
    `🧪 AI Test: Reach out to ${TEST_USER.aliases[0]} via email ${TEST_USER.email}`
  ]

  const postedMessages: string[] = []
  for (const msg of testMessages) {
    const result = await slack.chat.postMessage({
      channel: channel.id,
      text: msg
    })
    if (result.ts) {
      postedMessages.push(result.ts)
      log('📝', `Posted: "${msg.slice(0, 50)}..."`)
    }
    await sleep(500) // Rate limiting
  }

  log('✅', `Posted ${postedMessages.length} test messages`)
  await sleep(2000) // Let messages propagate

  // ============================================
  // PHASE 2: SCAN MESSAGES WITH AI
  // ============================================
  separator('PHASE 2: AI-POWERED PII SCANNING')

  const historyResult = await slack.conversations.history({
    channel: channel.id,
    limit: 100
  })

  const messages = historyResult.messages || []
  log('🔍', `Scanning ${messages.length} messages for PII...`)

  const scanResults = {
    scanned: 0,
    withPII: 0,
    botMessages: 0,
    otherMessages: 0,
    deleted: 0,
    manualDeletionRequired: [] as any[]
  }

  for (const message of messages) {
    if (!message.text || !message.ts) continue
    scanResults.scanned++

    // Use AI to detect PII
    const piiResult = await detectPIIWithAI(message.text, TEST_USER, groqApiKey)

    if (piiResult.hasPII) {
      scanResults.withPII++
      
      const isBotMessage = message.user === botUserId
      
      log(isBotMessage ? '🤖' : '👤', `PII found in ${isBotMessage ? 'bot' : 'user'} message`, {
        preview: message.text.slice(0, 60) + '...',
        piiTypes: piiResult.piiTypes,
        confidence: piiResult.confidence,
        canDelete: isBotMessage
      })

      if (isBotMessage) {
        scanResults.botMessages++
        // Delete bot's own message
        try {
          await slack.chat.delete({
            channel: channel.id,
            ts: message.ts
          })
          scanResults.deleted++
          log('🗑️', 'Deleted bot message with PII')
        } catch (err: any) {
          log('❌', `Failed to delete: ${err.message}`)
        }
      } else {
        scanResults.otherMessages++
        scanResults.manualDeletionRequired.push({
          channel: channel.name,
          messageTs: message.ts,
          postedBy: message.user,
          piiTypes: piiResult.piiTypes,
          preview: piiResult.redactedText?.slice(0, 50)
        })
      }
    }

    await sleep(200) // Rate limiting for AI calls
  }

  // ============================================
  // PHASE 3: RESULTS SUMMARY
  // ============================================
  separator('RESULTS SUMMARY')

  console.log('')
  console.log('┌─────────────────────────────────────────────────────────┐')
  console.log('│  METRIC                    │  COUNT                     │')
  console.log('├─────────────────────────────────────────────────────────┤')
  console.log(`│  Messages scanned          │  ${String(scanResults.scanned).padEnd(25)} │`)
  console.log(`│  Messages with PII         │  ${String(scanResults.withPII).padEnd(25)} │`)
  console.log(`│  Bot messages (deletable)  │  ${String(scanResults.botMessages).padEnd(25)} │`)
  console.log(`│  User messages (manual)    │  ${String(scanResults.otherMessages).padEnd(25)} │`)
  console.log(`│  Messages deleted          │  ${String(scanResults.deleted).padEnd(25)} │`)
  console.log('└─────────────────────────────────────────────────────────┘')
  console.log('')

  if (scanResults.manualDeletionRequired.length > 0) {
    log('⚠️', 'Messages requiring manual admin deletion:')
    for (const msg of scanResults.manualDeletionRequired) {
      console.log(`    - Channel: #${msg.channel}, User: ${msg.postedBy}, PII: ${msg.piiTypes.join(', ')}`)
    }
  }

  log('✅', 'Slack AI PII scan complete!', {
    aiModel: groqApiKey ? 'openai/gpt-oss-120b' : 'regex-fallback',
    deletedCount: scanResults.deleted,
    manualRequired: scanResults.manualDeletionRequired.length
  })
}

async function detectPIIWithAI(
  text: string, 
  userIdentifiers: typeof TEST_USER, 
  groqApiKey: string | undefined
): Promise<{
  hasPII: boolean
  piiTypes: string[]
  confidence: number
  redactedText?: string
}> {
  // If Groq API key is available, use AI detection
  if (groqApiKey) {
    try {
      const Groq = (await import('groq-sdk')).default
      const groq = new Groq({ apiKey: groqApiKey })

      const prompt = `Analyze this Slack message for PII (Personally Identifiable Information) related to a specific user.

User identifiers to look for:
- Emails: ${userIdentifiers.email}
- Phones: ${userIdentifiers.phone}
- Names/Aliases: ${userIdentifiers.aliases.join(', ')}
- User ID: ${userIdentifiers.userId}

Message to analyze:
"${text}"

Respond in JSON format only:
{
  "hasPII": true/false,
  "piiTypes": ["email", "phone", "name", "userId", etc],
  "confidence": 0.0-1.0,
  "redactedText": "message with PII replaced by [REDACTED]"
}

Only return true if the message contains PII matching or related to the user identifiers above.`

      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500
      })

      const response = completion.choices[0]?.message?.content || ''
      
      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0])
        return {
          hasPII: result.hasPII || false,
          piiTypes: result.piiTypes || [],
          confidence: result.confidence || 0,
          redactedText: result.redactedText
        }
      }
    } catch (aiErr: any) {
      console.log(`    ⚠️ AI detection failed, using regex: ${aiErr.message}`)
    }
  }

  // Fallback to regex-based detection
  return detectPIIWithRegex(text, userIdentifiers)
}

function detectPIIWithRegex(text: string, userIdentifiers: typeof TEST_USER): {
  hasPII: boolean
  piiTypes: string[]
  confidence: number
  redactedText?: string
} {
  const piiTypes: string[] = []
  let redactedText = text
  
  // Check for email
  if (text.toLowerCase().includes(userIdentifiers.email.toLowerCase())) {
    piiTypes.push('email')
    redactedText = redactedText.replace(new RegExp(userIdentifiers.email, 'gi'), '[EMAIL REDACTED]')
  }

  // Check for phone
  const normalizedPhone = userIdentifiers.phone.replace(/\D/g, '')
  if (text.replace(/\D/g, '').includes(normalizedPhone)) {
    piiTypes.push('phone')
    redactedText = redactedText.replace(/\+?[\d\s\-\(\)]{10,}/g, '[PHONE REDACTED]')
  }

  // Check for name/aliases
  for (const alias of userIdentifiers.aliases) {
    if (text.toLowerCase().includes(alias.toLowerCase())) {
      piiTypes.push('name')
      redactedText = redactedText.replace(new RegExp(alias, 'gi'), '[NAME REDACTED]')
    }
  }

  // Check for userId
  if (text.toLowerCase().includes(userIdentifiers.userId.toLowerCase())) {
    piiTypes.push('userId')
    redactedText = redactedText.replace(new RegExp(userIdentifiers.userId, 'gi'), '[USER_ID REDACTED]')
  }

  return {
    hasPII: piiTypes.length > 0,
    piiTypes: Array.from(new Set(piiTypes)),
    confidence: piiTypes.length > 0 ? 0.85 : 0,
    redactedText
  }
}

// Run the test
main().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
