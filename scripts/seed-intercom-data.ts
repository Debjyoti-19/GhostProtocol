/**
 * Seed Intercom Test Data
 * 
 * Creates test contacts in Intercom for GDPR deletion testing.
 * Run: npx tsx scripts/seed-intercom-data.ts
 */

import { config } from 'dotenv'
config()

const INTERCOM_ACCESS_TOKEN = process.env.INTERCOM_ACCESS_TOKEN

if (!INTERCOM_ACCESS_TOKEN) {
  console.error('❌ INTERCOM_ACCESS_TOKEN not set in .env')
  console.log('\nTo get an Intercom Access Token:')
  console.log('1. Go to https://app.intercom.com/a/apps/_/developer-hub')
  console.log('2. Create or select an app')
  console.log('3. Go to Authentication tab')
  console.log('4. Copy the Access Token')
  console.log('5. Add to .env: INTERCOM_ACCESS_TOKEN=your-token')
  process.exit(1)
}

// Test contacts to create
const TEST_CONTACTS = [
  {
    email: 'gdpr.test@ghostprotocol.dev',
    name: 'John Doe'
  },
  {
    email: 'gdpr.test2@ghostprotocol.dev',
    name: 'Jane Smith'
  }
]

async function seedIntercomData() {
  console.log('🚀 Seeding Intercom Test Data')
  console.log('=' .repeat(50))

  try {
    const { IntercomClient } = await import('intercom-client')
    const intercom = new IntercomClient({ token: INTERCOM_ACCESS_TOKEN })

    console.log('✅ Intercom client initialized')

    // Create test contacts
    console.log('\n👤 Creating test contacts...')
    
    const createdContacts: any[] = []

    for (const contact of TEST_CONTACTS) {
      try {
        // Check if contact already exists
        const searchResponse = await intercom.contacts.search({
          query: {
            field: 'email',
            operator: '=',
            value: contact.email
          }
        })

        if (searchResponse.data && searchResponse.data.length > 0) {
          console.log(`   ⚠️  ${contact.email} already exists (ID: ${searchResponse.data[0].id})`)
          createdContacts.push(searchResponse.data[0])
          continue
        }

        // Create new contact
        const newContact = await intercom.contacts.create({
          role: 'user',
          email: contact.email,
          name: contact.name
        })

        console.log(`   ✅ Created: ${contact.email} (ID: ${newContact.id})`)
        createdContacts.push(newContact)

      } catch (err: any) {
        console.log(`   ❌ Failed to create ${contact.email}: ${err.message}`)
      }
    }

    // Create a test conversation for the first contact
    if (createdContacts.length > 0) {
      console.log('\n💬 Creating test conversation...')
      
      try {
        const contactId = createdContacts[0].id
        
        // Note: Creating conversations via API requires specific setup
        // For testing, we'll just verify the contact exists
        console.log(`   ℹ️  Contact ${contactId} ready for conversation testing`)
        console.log('   ℹ️  To create test conversations, use the Intercom dashboard')
        
      } catch (convErr: any) {
        console.log(`   ⚠️  Could not create conversation: ${convErr.message}`)
      }
    }

    // Summary
    console.log('\n' + '=' .repeat(50))
    console.log('📊 Summary:')
    console.log(`   Contacts created/found: ${createdContacts.length}`)
    
    console.log('\n📋 To test GDPR deletion, use this curl command:')
    console.log(`
curl -X POST http://localhost:3000/erasure-request \\
  -H "Content-Type: application/json" \\
  -d '{
    "userIdentifiers": {
      "userId": "intercom_test_user",
      "emails": ["gdpr.test@ghostprotocol.dev"],
      "phones": ["+1-555-123-4567"],
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

    console.log('\n✅ Intercom test data seeded!')
    console.log('   The workflow will delete contacts and archive conversations.')

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.statusCode === 401) {
      console.error('   Invalid access token. Check your INTERCOM_ACCESS_TOKEN.')
    }
  }
}

seedIntercomData()
