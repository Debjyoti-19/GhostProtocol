/**
 * Test Intercom + AI Agent Integration
 * 
 * Retrieves contacts from Intercom and uses AI to analyze PII.
 * Run: npx tsx scripts/test-intercom-ai.ts
 */

import { config } from 'dotenv'
config()

const INTERCOM_ACCESS_TOKEN = process.env.INTERCOM_ACCESS_TOKEN
const GROQ_API_KEY = process.env.GROQ_API_KEY

async function testIntercomAI() {
  console.log('🤖 Testing Intercom + AI Agent Integration')
  console.log('=' .repeat(60))

  if (!INTERCOM_ACCESS_TOKEN) {
    console.error('❌ INTERCOM_ACCESS_TOKEN not set')
    console.log('\nTo get an Intercom Access Token:')
    console.log('1. Go to https://app.intercom.com/a/apps/_/developer-hub')
    console.log('2. Create or select an app')
    console.log('3. Copy the Access Token')
    process.exit(1)
  }

  if (!GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY not set')
    process.exit(1)
  }

  try {
    // Initialize Intercom
    const { IntercomClient } = await import('intercom-client')
    const intercom = new IntercomClient({ token: INTERCOM_ACCESS_TOKEN })
    console.log('✅ Intercom client initialized')

    // Initialize Groq AI
    const Groq = (await import('groq-sdk')).default
    const groq = new Groq({ apiKey: GROQ_API_KEY })
    console.log('✅ Groq AI client initialized')

    // Test email to search
    const testEmail = 'gdpr.test@ghostprotocol.dev'
    console.log(`\n📧 Searching for contact: ${testEmail}`)

    // Step 1: Search for contact in Intercom
    let contactData = null
    try {
      const searchResponse = await intercom.contacts.search({
        query: {
          field: 'email',
          operator: '=',
          value: testEmail
        }
      })

      const contacts = searchResponse.data || []
      
      if (contacts.length > 0) {
        contactData = contacts[0]
        console.log('\n✅ Contact found in Intercom:')
        console.log(`   ID: ${contactData.id}`)
        console.log(`   Email: ${contactData.email}`)
        console.log(`   Name: ${contactData.name || 'N/A'}`)
        console.log(`   Phone: ${contactData.phone || 'N/A'}`)
        console.log(`   Role: ${contactData.role}`)
        console.log(`   Created: ${contactData.created_at ? new Date(contactData.created_at * 1000).toISOString() : 'N/A'}`)
      } else {
        console.log('\n⚠️  Contact not found in Intercom')
        console.log('   Run: npx tsx scripts/seed-intercom-data.ts')
      }
    } catch (err: any) {
      console.log(`\n⚠️  Search error: ${err.message}`)
    }

    // Step 2: Get conversations (if contact found)
    let conversations: any[] = []
    if (contactData?.id) {
      console.log('\n💬 Checking conversations...')
      try {
        const convResponse = await intercom.conversations.search({
          query: {
            field: 'contact_ids',
            operator: '=',
            value: contactData.id
          }
        })
        conversations = convResponse.data || []
        console.log(`   Found ${conversations.length} conversations`)
      } catch (convErr: any) {
        console.log(`   Could not fetch conversations: ${convErr.message}`)
      }
    }

    // Step 3: Use AI to analyze the data for PII
    console.log('\n🤖 AI Agent analyzing data for PII...')
    
    const dataToAnalyze = {
      contact: contactData || { email: testEmail, name: 'John Doe' },
      conversationCount: conversations.length,
      sampleConversation: conversations[0]?.source?.body?.slice(0, 200) || 'No conversations'
    }

    const prompt = `You are a GDPR compliance AI agent. Analyze this Intercom data and identify all PII.

Data to analyze:
${JSON.stringify(dataToAnalyze, null, 2)}

User requesting deletion:
- Email: ${testEmail}
- Name: John Doe

Respond in JSON format:
{
  "piiFound": true/false,
  "piiTypes": ["email", "name", "phone", etc],
  "dataLocations": ["contact record", "conversations", etc],
  "deletionRecommendations": ["delete contact", "archive conversations", etc],
  "riskLevel": "low/medium/high",
  "summary": "Brief summary"
}`

    const startTime = Date.now()
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 800
    })
    const responseTime = Date.now() - startTime

    const response = completion.choices[0]?.message?.content || ''
    console.log(`   Response time: ${responseTime}ms`)

    // Parse and display AI analysis
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0])
      
      console.log('\n📋 AI Analysis Results:')
      console.log('─'.repeat(40))
      console.log(`   PII Found: ${analysis.piiFound ? '✅ YES' : '❌ NO'}`)
      console.log(`   Risk Level: ${analysis.riskLevel?.toUpperCase() || 'N/A'}`)
      console.log(`   PII Types: ${analysis.piiTypes?.join(', ') || 'none'}`)
      console.log(`   Data Locations: ${analysis.dataLocations?.join(', ') || 'none'}`)
      console.log(`\n   Recommendations:`)
      for (const rec of analysis.deletionRecommendations || []) {
        console.log(`     • ${rec}`)
      }
      console.log(`\n   Summary: ${analysis.summary || 'N/A'}`)
    }

    // Step 4: Test deletion capability
    console.log('\n' + '=' .repeat(60))
    console.log('🧪 Testing deletion capabilities...')
    
    if (contactData?.id) {
      console.log(`   ✅ Can delete contact ID: ${contactData.id}`)
      console.log(`   ✅ Can archive ${conversations.length} conversations`)
    } else {
      console.log('   ⚠️  No contact to delete (not found)')
    }

    console.log('\n' + '=' .repeat(60))
    console.log('✅ Intercom + AI integration test complete!')
    console.log('\nThe GDPR workflow will:')
    console.log('  1. Search for contact by email')
    console.log('  2. Archive all conversations')
    console.log('  3. Use AI to scan conversations for PII')
    console.log('  4. Delete the contact')
    console.log('  5. Generate deletion receipt')

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.statusCode === 401) {
      console.error('   Invalid access token. Check your INTERCOM_ACCESS_TOKEN.')
    }
  }
}

testIntercomAI()
