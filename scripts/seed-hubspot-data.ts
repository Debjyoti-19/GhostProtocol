/**
 * Seed HubSpot Test Data
 * 
 * Creates test contacts in HubSpot for GDPR deletion testing.
 * Run: npx tsx scripts/seed-hubspot-data.ts
 */

import { config } from 'dotenv'
config()

const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

if (!HUBSPOT_ACCESS_TOKEN) {
  console.error('❌ HUBSPOT_ACCESS_TOKEN not set in .env')
  process.exit(1)
}

const TEST_CONTACTS = [
  {
    email: 'gdpr.test@ghostprotocol.dev',
    firstname: 'John',
    lastname: 'Doe',
    phone: '+15551234567'
  },
  {
    email: 'gdpr.test2@ghostprotocol.dev',
    firstname: 'Jane',
    lastname: 'Smith',
    phone: '+15559876543'
  }
]

async function seedHubSpotData() {
  console.log('🚀 Seeding HubSpot Test Data')
  console.log('=' .repeat(50))

  try {
    const { Client } = await import('@hubspot/api-client')
    const hubspot = new Client({ accessToken: HUBSPOT_ACCESS_TOKEN })

    console.log('✅ HubSpot client initialized')

    // Create test contacts
    console.log('\n👤 Creating test contacts...')
    
    const createdContacts: any[] = []

    for (const contact of TEST_CONTACTS) {
      try {
        // Check if contact exists
        const searchResponse = await hubspot.crm.contacts.searchApi.doSearch({
          filterGroups: [{
            filters: [{
              propertyName: 'email',
              operator: 'EQ',
              value: contact.email
            }]
          }],
          properties: ['email', 'firstname', 'lastname'],
          limit: 1
        })

        if (searchResponse.results && searchResponse.results.length > 0) {
          console.log(`   ⚠️  ${contact.email} already exists (ID: ${searchResponse.results[0].id})`)
          createdContacts.push(searchResponse.results[0])
          continue
        }

        // Create new contact
        const newContact = await hubspot.crm.contacts.basicApi.create({
          properties: contact
        })

        console.log(`   ✅ Created: ${contact.email} (ID: ${newContact.id})`)
        createdContacts.push(newContact)

      } catch (err: any) {
        console.log(`   ❌ Failed to create ${contact.email}: ${err.message}`)
      }
    }

    // Create a test deal for the first contact
    if (createdContacts.length > 0) {
      console.log('\n💰 Creating test deal...')
      try {
        const deal = await hubspot.crm.deals.basicApi.create({
          properties: {
            dealname: 'GDPR Test Deal',
            amount: '1000',
            pipeline: 'default',
            dealstage: 'appointmentscheduled'
          }
        })

        // Associate deal with contact
        await hubspot.crm.deals.associationsApi.create(
          deal.id,
          'contacts',
          createdContacts[0].id,
          [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]
        )

        console.log(`   ✅ Created deal: ${deal.id} (associated with ${createdContacts[0].id})`)
      } catch (dealErr: any) {
        console.log(`   ⚠️  Could not create deal: ${dealErr.message}`)
      }
    }

    console.log('\n' + '=' .repeat(50))
    console.log('📊 Summary:')
    console.log(`   Contacts created/found: ${createdContacts.length}`)

    console.log('\n✅ HubSpot test data seeded!')

  } catch (error: any) {
    console.error('❌ Error:', error.message)
  }
}

seedHubSpotData()
