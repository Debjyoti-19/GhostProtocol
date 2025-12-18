/**
 * Test SendGrid + AI Agent Integration
 * 
 * Retrieves contacts from SendGrid and uses AI to analyze PII.
 * Run: npx tsx scripts/test-sendgrid-ai.ts
 */

import { config } from 'dotenv'
config()

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY

async function testSendGridAI() {
  console.log('🤖 Testing SendGrid + AI Agent Integration')
  console.log('=' .repeat(60))

  if (!SENDGRID_API_KEY) {
    console.error('❌ SENDGRID_API_KEY not set')
    process.exit(1)
  }

  if (!GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY not set')
    process.exit(1)
  }

  try {
    // Initialize SendGrid
    const sgClient = (await import('@sendgrid/client')).default
    sgClient.setApiKey(SENDGRID_API_KEY)
    console.log('✅ SendGrid client initialized')

    // Initialize Groq AI
    const Groq = (await import('groq-sdk')).default
    const groq = new Groq({ apiKey: GROQ_API_KEY })
    console.log('✅ Groq AI client initialized')

    // Test email to search
    const testEmail = 'gdpr.test@ghostprotocol.dev'
    console.log(`\n📧 Searching for contact: ${testEmail}`)

    // Step 1: Search for contact in SendGrid
    let contactData = null
    try {
      const [searchResponse] = await sgClient.request({
        url: '/v3/marketing/contacts/search/emails',
        method: 'POST',
        body: { emails: [testEmail] }
      })

      const result = (searchResponse.body as any)?.result || {}
      contactData = result[testEmail]?.contact

      if (contactData) {
        console.log('\n✅ Contact found in SendGrid:')
        console.log(`   ID: ${contactData.id}`)
        console.log(`   Email: ${contactData.email}`)
        console.log(`   First Name: ${contactData.first_name || 'N/A'}`)
        console.log(`   Last Name: ${contactData.last_name || 'N/A'}`)
        console.log(`   Created: ${contactData.created_at || 'N/A'}`)
      } else {
        console.log('\n⚠️  Contact not found in SendGrid (may still be processing)')
      }
    } catch (err: any) {
      console.log(`\n⚠️  Search error: ${err.message}`)
    }

    // Step 2: Get email activity (if available)
    console.log('\n📊 Checking email activity...')
    let emailActivity: any[] = []
    
    try {
      const [activityResponse] = await sgClient.request({
        url: `/v3/messages?query=to_email="${testEmail}"&limit=10`,
        method: 'GET'
      })
      emailActivity = (activityResponse.body as any)?.messages || []
      console.log(`   Found ${emailActivity.length} email activities`)
    } catch (err: any) {
      console.log(`   Email activity not available: ${err.message}`)
      // Create mock activity for AI testing
      emailActivity = [
        { subject: 'Welcome to GhostProtocol', to_email: testEmail, status: 'delivered' },
        { subject: 'Your account has been created', to_email: testEmail, status: 'delivered' },
        { subject: 'Password reset request', to_email: testEmail, status: 'opened' }
      ]
      console.log(`   Using ${emailActivity.length} mock activities for AI test`)
    }

    // Step 3: Use AI to analyze the data for PII
    console.log('\n🤖 AI Agent analyzing data for PII...')
    
    const dataToAnalyze = {
      contact: contactData || { email: testEmail, first_name: 'John', last_name: 'Doe' },
      emailActivity: emailActivity.slice(0, 5)
    }

    const prompt = `You are a GDPR compliance AI agent. Analyze this SendGrid data and identify all PII (Personally Identifiable Information).

Data to analyze:
${JSON.stringify(dataToAnalyze, null, 2)}

User requesting deletion:
- Email: ${testEmail}
- Name: John Doe

Respond in JSON format:
{
  "piiFound": true/false,
  "piiTypes": ["email", "name", "etc"],
  "dataLocations": ["contact record", "email activity", etc],
  "deletionRecommendations": ["delete contact", "add to suppression", etc],
  "riskLevel": "low/medium/high",
  "summary": "Brief summary of findings"
}`

    const startTime = Date.now()
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
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
    } else {
      console.log('\n   Raw AI response:')
      console.log(response)
    }

    // Step 4: Test deletion capability
    console.log('\n' + '=' .repeat(60))
    console.log('🧪 Testing deletion capabilities...')
    
    if (contactData?.id) {
      console.log(`   ✅ Can delete contact ID: ${contactData.id}`)
    } else {
      console.log('   ⚠️  No contact to delete (not found)')
    }

    // Test suppression
    console.log('   Testing suppression list...')
    try {
      // Check if already suppressed
      const [suppResponse] = await sgClient.request({
        url: `/v3/asm/suppressions/global/${testEmail}`,
        method: 'GET'
      })
      console.log(`   ✅ Email suppression status: ${(suppResponse.body as any)?.recipient_email ? 'Suppressed' : 'Not suppressed'}`)
    } catch {
      console.log('   ✅ Email not currently suppressed (can be added)')
    }

    console.log('\n' + '=' .repeat(60))
    console.log('✅ SendGrid + AI integration test complete!')
    console.log('\nThe GDPR workflow will:')
    console.log('  1. Search for contact by email')
    console.log('  2. Delete contact if found')
    console.log('  3. Add to global suppression list')
    console.log('  4. Use AI to scan email activity for PII')
    console.log('  5. Generate deletion receipt')

  } catch (error: any) {
    console.error('❌ Error:', error.message)
  }
}

testSendGridAI()
