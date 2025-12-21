/**
 * Seed Mixpanel Test Data
 * 
 * Creates test user profiles and events in Mixpanel for GDPR deletion testing.
 * Run: npx tsx scripts/seed-mixpanel-data.ts
 */

import { config } from 'dotenv'
config()

const MIXPANEL_PROJECT_TOKEN = process.env.MIXPANEL_PROJECT_TOKEN

if (!MIXPANEL_PROJECT_TOKEN) {
  console.error('❌ MIXPANEL_PROJECT_TOKEN not set in .env')
  process.exit(1)
}

const TEST_USERS = [
  {
    distinct_id: 'gdpr_test_user_001',
    email: 'gdpr.test@ghostprotocol.dev',
    name: 'John Doe',
    plan: 'premium'
  },
  {
    distinct_id: 'gdpr_test_user_002',
    email: 'gdpr.test2@ghostprotocol.dev',
    name: 'Jane Smith',
    plan: 'free'
  }
]

async function seedMixpanelData() {
  console.log('🚀 Seeding Mixpanel Test Data')
  console.log('='.repeat(50))

  try {
    const Mixpanel = (await import('mixpanel')).default
    const mixpanel = Mixpanel.init(MIXPANEL_PROJECT_TOKEN)

    console.log('✅ Mixpanel client initialized')
    console.log(`   Project Token: ${MIXPANEL_PROJECT_TOKEN.slice(0, 8)}...`)

    // Create test user profiles
    console.log('\n👤 Creating test user profiles...')

    for (const user of TEST_USERS) {
      try {
        // Set user profile
        mixpanel.people.set(user.distinct_id, {
          $email: user.email,
          $name: user.name,
          plan: user.plan,
          created_at: new Date().toISOString()
        })
        console.log(`   ✅ Created profile: ${user.email} (${user.distinct_id})`)

        // Track some events
        mixpanel.track('Page View', {
          distinct_id: user.distinct_id,
          page: '/dashboard',
          timestamp: new Date().toISOString()
        })

        mixpanel.track('Button Click', {
          distinct_id: user.distinct_id,
          button: 'signup',
          timestamp: new Date().toISOString()
        })

        console.log(`   ✅ Tracked events for: ${user.distinct_id}`)

      } catch (err: any) {
        console.log(`   ❌ Failed for ${user.email}: ${err.message}`)
      }
    }

    // Wait for data to be sent
    console.log('\n⏳ Waiting for data to sync (3s)...')
    await new Promise(r => setTimeout(r, 3000))

    console.log('\n' + '='.repeat(50))
    console.log('📊 Summary:')
    console.log(`   Users created: ${TEST_USERS.length}`)
    console.log(`   Events tracked: ${TEST_USERS.length * 2}`)

    console.log('\n📋 To test GDPR deletion, the workflow will:')
    console.log('   1. Call Mixpanel GDPR API to request deletion')
    console.log('   2. Delete user profiles via Engage API')
    console.log('   3. Generate deletion receipt')

    console.log('\n✅ Mixpanel test data seeded!')

  } catch (error: any) {
    console.error('❌ Error:', error.message)
  }
}

seedMixpanelData()
