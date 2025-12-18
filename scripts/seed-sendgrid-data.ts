/**
 * Seed SendGrid Test Data
 * 
 * Creates test contacts in SendGrid for GDPR deletion testing.
 * Run: npx tsx scripts/seed-sendgrid-data.ts
 */

import { config } from 'dotenv'
config()

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY

if (!SENDGRID_API_KEY) {
  console.error('❌ SENDGRID_API_KEY not set in .env')
  console.log('\nTo get a SendGrid API key:')
  console.log('1. Go to https://app.sendgrid.com/settings/api_keys')
  console.log('2. Create API Key with Full Access')
  console.log('3. Add to .env: SENDGRID_API_KEY=SG.your-key')
  process.exit(1)
}

// Test contacts to create
const TEST_CONTACTS = [
  {
    email: 'gdpr.test@ghostprotocol.dev',
    first_name: 'John',
    last_name: 'Doe',
    custom_fields: {}
  },
  {
    email: 'gdpr.test2@ghostprotocol.dev', 
    first_name: 'Jane',
    last_name: 'Smith',
    custom_fields: {}
  }
]

async function seedSendGridData() {
  console.log('🚀 Seeding SendGrid Test Data')
  console.log('=' .repeat(50))

  try {
    const sgClient = (await import('@sendgrid/client')).default
    sgClient.setApiKey(SENDGRID_API_KEY)

    // Step 1: Add contacts
    console.log('\n📧 Adding test contacts...')
    
    const [addResponse] = await sgClient.request({
      url: '/v3/marketing/contacts',
      method: 'PUT',
      body: { contacts: TEST_CONTACTS }
    })

    console.log(`✅ Contacts queued for addition`)
    console.log(`   Job ID: ${(addResponse.body as any)?.job_id || 'N/A'}`)

    // Wait for contacts to be processed
    console.log('\n⏳ Waiting for contacts to be processed (10s)...')
    await new Promise(r => setTimeout(r, 10000))

    // Step 2: Verify contacts were added
    console.log('\n🔍 Verifying contacts...')
    
    for (const contact of TEST_CONTACTS) {
      try {
        const [searchResponse] = await sgClient.request({
          url: '/v3/marketing/contacts/search/emails',
          method: 'POST',
          body: { emails: [contact.email] }
        })

        const result = (searchResponse.body as any)?.result || {}
        const found = result[contact.email]?.contact

        if (found) {
          console.log(`   ✅ ${contact.email} - ID: ${found.id}`)
        } else {
          console.log(`   ⚠️  ${contact.email} - Not found yet (may still be processing)`)
        }
      } catch (err: any) {
        console.log(`   ❌ ${contact.email} - Error: ${err.message}`)
      }
    }

    // Step 3: Get contact count
    console.log('\n📊 Contact Statistics:')
    try {
      const [countResponse] = await sgClient.request({
        url: '/v3/marketing/contacts/count',
        method: 'GET'
      })
      console.log(`   Total contacts: ${(countResponse.body as any)?.contact_count || 0}`)
    } catch {
      console.log('   Could not get contact count')
    }

    console.log('\n' + '=' .repeat(50))
    console.log('📋 To test GDPR deletion, use this curl command:')
    console.log(`
curl -X POST http://localhost:3000/erasure-request \\
  -H "Content-Type: application/json" \\
  -d '{
    "userIdentifiers": {
      "userId": "sendgrid_test_user",
      "emails": ["gdpr.test@ghostprotocol.dev"],
      "phones": [],
      "aliases": ["John Doe"]
    },
    "legalProof": {
      "type": "SIGNED_REQUEST",
      "evidence": "Digital signature",
      "verifiedAt": "${new Date().toISOString()}"
    },
    "jurisdiction": "EU"
  }'
`)

    console.log('\n✅ SendGrid test data seeded!')
    console.log('   The workflow will delete contacts and add to suppression list.')

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.response?.body) {
      console.error('   Details:', JSON.stringify(error.response.body, null, 2))
    }
  }
}

seedSendGridData()
