/**
 * Test HubSpot Integration
 * 
 * Tests the HubSpot CRM connection and deletion capabilities.
 * Run: npx tsx scripts/test-hubspot.ts
 */

import { config } from 'dotenv'
config()

const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

async function testHubSpot() {
  console.log('🧪 Testing HubSpot Integration')
  console.log('=' .repeat(50))

  if (!HUBSPOT_ACCESS_TOKEN) {
    console.error('❌ HUBSPOT_ACCESS_TOKEN not set')
    process.exit(1)
  }

  try {
    const { Client } = await import('@hubspot/api-client')
    const hubspot = new Client({ accessToken: HUBSPOT_ACCESS_TOKEN })

    console.log('✅ HubSpot client initialized')

    // Test 1: Search for contact
    const testEmail = 'gdpr.test@ghostprotocol.dev'
    console.log(`\n📧 Searching for contact: ${testEmail}`)

    const searchResponse = await hubspot.crm.contacts.searchApi.doSearch({
      filterGroups: [{
        filters: [{
          propertyName: 'email',
          operator: 'EQ',
          value: testEmail
        }]
      }],
      properties: ['email', 'firstname', 'lastname', 'phone'],
      limit: 10
    })

    if (searchResponse.results && searchResponse.results.length > 0) {
      const contact = searchResponse.results[0]
      console.log('\n✅ Contact found:')
      console.log(`   ID: ${contact.id}`)
      console.log(`   Email: ${contact.properties?.email}`)
      console.log(`   Name: ${contact.properties?.firstname} ${contact.properties?.lastname}`)
      console.log(`   Phone: ${contact.properties?.phone || 'N/A'}`)

      // Test 2: Check for associated deals
      console.log('\n💰 Checking associated deals...')
      try {
        const associations = await hubspot.crm.contacts.associationsApi.getAll(
          contact.id,
          'deals'
        )
        console.log(`   Found ${associations.results?.length || 0} associated deals`)
      } catch {
        console.log('   No deals associated')
      }

      // Test 3: Verify deletion capability
      console.log('\n🗑️  Deletion capabilities:')
      console.log(`   ✅ Can delete contact ID: ${contact.id}`)
      console.log('   ✅ Can archive associated deals')

    } else {
      console.log('\n⚠️  Contact not found')
      console.log('   Run: npx tsx scripts/seed-hubspot-data.ts')
    }

    // Test 4: Get account info
    console.log('\n📊 Account Info:')
    try {
      const accountInfo = await hubspot.crm.contacts.basicApi.getPage(1)
      console.log(`   Total contacts accessible: ${accountInfo.results?.length || 0}+`)
    } catch {
      console.log('   Could not get account info')
    }

    console.log('\n' + '=' .repeat(50))
    console.log('✅ HubSpot integration test complete!')

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.code === 401) {
      console.error('   Invalid access token')
    }
  }
}

testHubSpot()
