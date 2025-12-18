/**
 * Test the full GDPR erasure workflow with real Stripe deletion
 * Run with: npx tsx scripts/test-workflow.ts
 * 
 * Prerequisites:
 * 1. Start the server: npm run dev
 * 2. Seed Stripe data: npx tsx scripts/seed-stripe-data.ts seed
 */

import 'dotenv/config'

const API_BASE = 'http://localhost:3000'

interface ErasureRequest {
  userIdentifiers: {
    userId: string
    emails: string[]
    phones: string[]
    aliases: string[]
  }
  legalProof: {
    type: 'SIGNED_REQUEST' | 'LEGAL_FORM' | 'OTP_VERIFIED'
    evidence: string
    verifiedAt: string
  }
  jurisdiction: 'EU' | 'US' | 'OTHER'
  requestedBy: {
    userId: string
    role: string
    organization: string
  }
}

async function createErasureRequest(request: ErasureRequest) {
  const response = await fetch(`${API_BASE}/erasure-request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  })

  const data = await response.json()
  return { status: response.status, data }
}

async function getWorkflowStatus(workflowId: string) {
  const response = await fetch(`${API_BASE}/erasure-request/${workflowId}/status`)
  const data = await response.json()
  return { status: response.status, data }
}

async function testFullWorkflow() {
  console.log('\n🚀 Testing Full GDPR Erasure Workflow\n')
  console.log('=' .repeat(50))

  // Test user - use one from seed data
  const testEmail = 'gdpr.test@mail.com'
  
  console.log(`\n📧 Testing erasure for: ${testEmail}\n`)

  // Step 1: Create erasure request
  console.log('1️⃣ Creating erasure request...')
  
  const request: ErasureRequest = {
    userIdentifiers: {
      userId: 'gdpr_1234',
      emails: [testEmail],
      phones: ['+1999888777'],
      aliases: ['gdpr_test_user']
    },
    legalProof: {
      type: 'SIGNED_REQUEST',
      evidence: 'Digital signature verified via DocuSign',
      verifiedAt: new Date().toISOString()
    },
    jurisdiction: 'EU',
    requestedBy: {
      userId: 'admin_001',
      role: 'compliance_officer',
      organization: 'GhostProtocol Inc'
    }
  }

  try {
    const result = await createErasureRequest(request)
    
    if (result.status === 201) {
      console.log(`   ✅ Workflow created!`)
      console.log(`   📋 Request ID: ${result.data.requestId}`)
      console.log(`   🔄 Workflow ID: ${result.data.workflowId}`)
      
      const workflowId = result.data.workflowId

      // Step 2: Monitor workflow progress
      console.log('\n2️⃣ Monitoring workflow progress...')
      console.log('   (Stripe deletion should trigger automatically)\n')

      // Poll for status updates
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds
        
        try {
          const status = await getWorkflowStatus(workflowId)
          
          if (status.status === 200) {
            console.log(`   📊 Status check ${i + 1}:`)
            console.log(`      - Workflow status: ${status.data.status}`)
            console.log(`      - Current phase: ${status.data.currentPhase || 'starting'}`)
            
            if (status.data.steps) {
              const steps = Object.entries(status.data.steps)
              steps.forEach(([name, step]: [string, any]) => {
                const icon = step.status === 'DELETED' ? '✅' : 
                            step.status === 'IN_PROGRESS' ? '🔄' : 
                            step.status === 'FAILED' ? '❌' : '⏳'
                console.log(`      - ${name}: ${icon} ${step.status}`)
                
                if (step.evidence?.receipt) {
                  console.log(`        Receipt: ${step.evidence.receipt}`)
                }
              })
            }

            // Check if Stripe deletion completed
            if (status.data.steps?.['stripe-deletion']?.status === 'DELETED') {
              console.log('\n🎉 Stripe deletion completed successfully!')
              console.log(`   Receipt: ${status.data.steps['stripe-deletion'].evidence?.receipt}`)
              break
            }

            if (status.data.status === 'COMPLETED') {
              console.log('\n🎉 Full workflow completed!')
              break
            }

            if (status.data.status === 'FAILED') {
              console.log('\n❌ Workflow failed!')
              break
            }
          }
        } catch (e) {
          console.log(`   ⏳ Waiting for workflow to initialize...`)
        }
      }

    } else if (result.status === 409) {
      console.log(`   ⚠️ Duplicate request detected`)
      console.log(`   Existing workflow: ${result.data.existingWorkflowId}`)
    } else {
      console.log(`   ❌ Failed to create workflow: ${result.data.error}`)
    }

  } catch (error: any) {
    if (error.cause?.code === 'ECONNREFUSED') {
      console.log('\n❌ Cannot connect to server!')
      console.log('\n💡 Make sure to start the server first:')
      console.log('   npm run dev')
    } else {
      console.log(`\n❌ Error: ${error.message}`)
    }
  }

  console.log('\n' + '='.repeat(50))
  console.log('Test complete!\n')
}

// Quick test - just Stripe deletion directly
async function testStripeOnly() {
  console.log('\n🔍 Quick Stripe Deletion Test\n')
  
  const { getStripeConnector } = await import('../src/gdpr/integrations/stripe-connector.js')
  const stripe = getStripeConnector()

  const testEmail = 'gdpr.test@ghostprotocol.dev'
  
  console.log(`Testing deletion for: ${testEmail}`)
  console.log(`Mode: ${stripe.isInTestMode() ? 'TEST' : 'LIVE'}\n`)

  const result = await stripe.deleteCustomer('user_gdpr_demo', [testEmail])

  if (result.success) {
    console.log('✅ Deletion successful!')
    console.log(`   Receipt: ${result.receipt}`)
    console.log(`   Customer ID: ${result.customerId || 'No customer found'}`)
    console.log(`   Deleted resources:`, result.deletedResources)
  } else {
    console.log('❌ Deletion failed!')
    console.log(`   Error: ${result.error}`)
  }
}

// Run based on command line arg
const command = process.argv[2]

if (command === 'stripe') {
  testStripeOnly()
} else {
  testFullWorkflow()
}
