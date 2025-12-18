/**
 * Seed mock user data in Stripe for GDPR demo
 * Run with: npx tsx scripts/seed-stripe-data.ts seed
 */

import 'dotenv/config'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Mock users for GDPR demo
const mockUsers = [
  {
    email: 'john.doe@example.com',
    name: 'John Doe',
    phone: '+1234567890',
    address: {
      line1: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94102',
      country: 'US'
    },
    metadata: {
      userId: 'user_001',
      signupDate: '2024-01-15',
      plan: 'premium'
    }
  },
  {
    email: 'jane.smith@example.com',
    name: 'Jane Smith',
    phone: '+1987654321',
    address: {
      line1: '456 Oak Ave',
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      country: 'US'
    },
    metadata: {
      userId: 'user_002',
      signupDate: '2024-02-20',
      plan: 'basic'
    }
  },
  {
    email: 'bob.wilson@example.com',
    name: 'Bob Wilson',
    phone: '+1555123456',
    address: {
      line1: '789 Pine Rd',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      country: 'US'
    },
    metadata: {
      userId: 'user_003',
      signupDate: '2024-03-10',
      plan: 'enterprise'
    }
  },
  {
    email: 'alice.johnson@example.com',
    name: 'Alice Johnson',
    phone: '+1444789012',
    address: {
      line1: '321 Elm St',
      city: 'Seattle',
      state: 'WA',
      postal_code: '98101',
      country: 'US'
    },
    metadata: {
      userId: 'user_004',
      signupDate: '2024-04-05',
      plan: 'premium'
    }
  },
  {
    email: 'gdpr.test@mail.com',
    name: 'GDPR Test User',
    phone: '+1999888777',
    address: {
      line1: '100 Privacy Lane',
      city: 'Berlin',
      state: 'Berlin',
      postal_code: '10115',
      country: 'DE'
    },
    metadata: {
      userId: 'gdpr_1234',
      signupDate: '2024-06-01',
      plan: 'premium',
      gdprDemo: 'true'
    }
  }
]

async function seedStripeData() {
  console.log('\n🌱 Seeding Stripe with mock user data...\n')

  const createdCustomers: any[] = []

  for (const user of mockUsers) {
    try {
      // Check if customer already exists
      const existing = await stripe.customers.search({
        query: `email:'${user.email}'`
      })

      if (existing.data.length > 0) {
        console.log(`⏭️  Skipping ${user.email} (already exists: ${existing.data[0].id})`)
        createdCustomers.push(existing.data[0])
        continue
      }

      // Create customer
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        phone: user.phone,
        address: user.address,
        metadata: user.metadata
      })

      console.log(`✅ Created: ${user.name} (${customer.id})`)
      createdCustomers.push(customer)

      // Add a test payment method (fake card)
      const paymentMethod = await stripe.paymentMethods.create({
        type: 'card',
        card: {
          token: 'tok_visa' // Stripe test token
        }
      })

      await stripe.paymentMethods.attach(paymentMethod.id, {
        customer: customer.id
      })

      console.log(`   💳 Added payment method: ${paymentMethod.id}`)

    } catch (error: any) {
      console.error(`❌ Failed to create ${user.email}: ${error.message}`)
    }
  }

  console.log('\n📋 Summary:')
  console.log(`   Total customers created/found: ${createdCustomers.length}`)
  console.log('\n🎯 Test GDPR erasure with these emails:')
  mockUsers.forEach(u => {
    console.log(`   - ${u.email} (userId: ${u.metadata.userId})`)
  })

  console.log('\n💡 To test erasure, call the API:')
  console.log(`   POST /gdpr/erasure`)
  console.log(`   Body: { "email": "gdpr.test@ghostprotocol.dev" }`)
  console.log('')
}

async function listAllCustomers() {
  console.log('\n📋 Current Stripe customers:\n')
  
  const customers = await stripe.customers.list({ limit: 20 })
  
  if (customers.data.length === 0) {
    console.log('   No customers found. Run seed first.')
    return
  }

  customers.data.forEach(c => {
    console.log(`   ${c.id} | ${c.email} | ${c.name}`)
  })
  console.log('')
}

// Run based on command line arg
const command = process.argv[2]

if (command === 'list') {
  listAllCustomers()
} else if (command === 'seed') {
  seedStripeData()
} else {
  console.log('Usage:')
  console.log('  npx tsx scripts/seed-stripe-data.ts seed   # Create mock users')
  console.log('  npx tsx scripts/seed-stripe-data.ts list   # List existing customers')
}
