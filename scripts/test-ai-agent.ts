/**
 * Test AI Agent for PII Detection
 * 
 * Tests the Groq AI integration for detecting PII in messages.
 * Run: npx tsx scripts/test-ai-agent.ts
 */

import { config } from 'dotenv'
config()

const GROQ_API_KEY = process.env.GROQ_API_KEY

if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY not set in .env')
  process.exit(1)
}

// Test user identifiers
const userIdentifiers = {
  emails: ['gdpr.test@ghostprotocol.dev'],
  phones: ['+1-555-123-4567'],
  aliases: ['John Doe']
}

// Test messages - mix of PII and non-PII
const testMessages = [
  { text: 'Hey team, please contact me at gdpr.test@ghostprotocol.dev for the project details.', expectedPII: true },
  { text: 'My phone number is +1-555-123-4567, call me anytime!', expectedPII: true },
  { text: 'This is John Doe from the engineering team.', expectedPII: true },
  { text: 'Meeting notes from today - nothing sensitive here.', expectedPII: false },
  { text: 'The quarterly report is ready for review.', expectedPII: false },
  { text: 'For verification, my SSN is 123-45-6789 (don\'t share this!)', expectedPII: true },
  { text: 'Contact John Doe at +1-555-123-4567 for urgent matters.', expectedPII: true },
]

async function testAIAgent() {
  console.log('🤖 Testing AI Agent for PII Detection')
  console.log('=' .repeat(60))
  console.log(`📡 Using Groq API with model: llama-3.3-70b-versatile`)
  console.log(`🔑 API Key: ${GROQ_API_KEY.slice(0, 10)}...${GROQ_API_KEY.slice(-4)}`)
  console.log('')

  try {
    const Groq = (await import('groq-sdk')).default
    const groq = new Groq({ apiKey: GROQ_API_KEY })

    console.log('✅ Groq SDK initialized successfully\n')

    let correct = 0
    let total = testMessages.length

    for (let i = 0; i < testMessages.length; i++) {
      const { text, expectedPII } = testMessages[i]
      console.log(`\n📝 Test ${i + 1}/${total}:`)
      console.log(`   Message: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`)
      console.log(`   Expected PII: ${expectedPII ? 'YES' : 'NO'}`)

      const prompt = `Analyze this message for PII (Personally Identifiable Information) related to a specific user.

User identifiers to look for:
- Emails: ${userIdentifiers.emails.join(', ')}
- Phones: ${userIdentifiers.phones.join(', ')}
- Names/Aliases: ${userIdentifiers.aliases.join(', ')}

Message to analyze:
"${text}"

Respond in JSON format only:
{
  "hasPII": true/false,
  "piiTypes": ["email", "phone", "name", "address", "ssn", etc],
  "confidence": 0.0-1.0,
  "redactedText": "message with PII replaced by [REDACTED]"
}

Only return true if the message contains PII matching or related to the user identifiers above.`

      const startTime = Date.now()
      
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500
      })

      const responseTime = Date.now() - startTime
      const response = completion.choices[0]?.message?.content || ''

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0])
        const isCorrect = result.hasPII === expectedPII
        
        if (isCorrect) correct++

        console.log(`   AI Result: ${result.hasPII ? 'YES' : 'NO'} (${isCorrect ? '✅ CORRECT' : '❌ WRONG'})`)
        console.log(`   PII Types: ${result.piiTypes?.join(', ') || 'none'}`)
        console.log(`   Confidence: ${(result.confidence * 100).toFixed(0)}%`)
        console.log(`   Response Time: ${responseTime}ms`)
        
        if (result.redactedText && result.hasPII) {
          console.log(`   Redacted: "${result.redactedText.slice(0, 60)}..."`)
        }
      } else {
        console.log(`   ❌ Failed to parse AI response`)
        console.log(`   Raw: ${response.slice(0, 100)}...`)
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500))
    }

    console.log('\n' + '=' .repeat(60))
    console.log(`📊 Results: ${correct}/${total} correct (${((correct/total)*100).toFixed(0)}% accuracy)`)
    console.log('')

    if (correct === total) {
      console.log('🎉 AI Agent is working perfectly!')
    } else if (correct >= total * 0.8) {
      console.log('✅ AI Agent is working well (>80% accuracy)')
    } else {
      console.log('⚠️  AI Agent needs tuning')
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.status === 401) {
      console.error('   Invalid API key. Check your GROQ_API_KEY in .env')
    } else if (error.status === 429) {
      console.error('   Rate limited. Wait a moment and try again.')
    }
  }
}

testAIAgent()
