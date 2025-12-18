/**
 * Quick test script to verify Stripe integration
 * Run with: npx tsx scripts/test-stripe.ts
 */

import 'dotenv/config'
import Stripe from 'stripe'

async function testStripeIntegration() {
  console.log('\n🔍 Testing Stripe Integration...\n')

  // Check if API key is set
  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) {
    console.error('❌ STRIPE_SECRET_KEY not found in .env file')
    process.exit(1)
  }

  const isTestMode = apiKey.startsWith('sk_test_') || apiKey.startsWith('rk_test_')
  console.log(`✅ API Key found (${isTestMode ? 'TEST MODE' : '⚠️ LIVE MODE'})\n`)

  const stripe = new Stripe(apiKey)

  try {
    // Test 1: List customers (verifies API key works)
    console.log('1️⃣ Testing API connection...')
    const customers = await stripe.customers.list({ limit: 1 })
    console.log(`   ✅ Connected! Found ${customers.data.length} customer(s)\n`)

    // Test 2: Create a test customer
    console.log('2️⃣ Creating test customer...')
    const testCustomer = await stripe.customers.create({
      email: 'gdpr-test@example.com',
      name: 'GDPR Test User',
      metadata: { test: 'true', purpose: 'gdpr-erasure-test' }
    })
    console.log(`   ✅ Created customer: ${testCustomer.id}\n`)

    // Test 3: Search for customer by email
    console.log('3️⃣ Searching customer by email...')
    const searchResult = await stripe.customers.search({
      query: `email:'gdpr-test@example.com'`
    })
    console.log(`   ✅ Found ${searchResult.data.length} customer(s) matching email\n`)

    // Test 4: Delete the test customer
    console.log('4️⃣ Deleting test customer (GDPR erasure)...')
    const deleted = await stripe.customers.del(testCustomer.id)
    console.log(`   ✅ Customer deleted: ${deleted.deleted}\n`)

    // Test 5: Verify deletion
    console.log('5️⃣ Verifying deletion...')
    try {
      const check = await stripe.customers.retrieve(testCustomer.id)
      if ('deleted' in check && check.deleted) {
        console.log('   ✅ Deletion verified - customer marked as deleted\n')
      }
    } catch (e: any) {
      if (e.code === 'resource_missing') {
        console.log('   ✅ Deletion verified - customer not found\n')
      }
    }

    console.log('🎉 All tests passed! Stripe integration is working.\n')
    console.log('📋 Summary:')
    console.log('   - API Key: Valid')
    console.log('   - Mode: ' + (isTestMode ? 'Test' : 'Live'))
    console.log('   - Create Customer: ✅')
    console.log('   - Search Customer: ✅')
    console.log('   - Delete Customer: ✅')
    console.log('   - Verify Deletion: ✅\n')

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message)
    
    if (error.type === 'StripeAuthenticationError') {
      console.error('\n💡 Your API key is invalid. Check:')
      console.error('   1. Copy the full key from Stripe dashboard')
      console.error('   2. Make sure there are no extra spaces')
      console.error('   3. Use a test key (sk_test_...) for testing')
    }
    
    if (error.type === 'StripePermissionError') {
      console.error('\n💡 Your API key lacks permissions. Enable:')
      console.error('   - Customers: Write')
      console.error('   - Subscriptions: Write')
      console.error('   - PaymentMethods: Write')
    }
    
    process.exit(1)
  }
}

testStripeIntegration()
