/**
 * Master Seed Script - Seeds all platforms with test data
 * 
 * This script runs all individual platform seeding scripts to create
 * comprehensive test data across all integrated services for GDPR testing.
 * 
 * Run: npx tsx scripts/seed-all-platforms.ts
 */

import { config } from 'dotenv'
import { spawn } from 'child_process'
import { promisify } from 'util'

// Load environment variables
config()

interface PlatformConfig {
    name: string
    script: string
    envVars: string[]
    optional?: boolean
    description: string
}

const PLATFORMS: PlatformConfig[] = [
    {
        name: 'PostgreSQL Database',
        script: 'scripts/seed-database.ts',
        envVars: ['DATABASE_URL'],
        description: 'Creates users, user_data, and user_sessions tables with test data'
    },
    {
        name: 'Stripe',
        script: 'scripts/seed-stripe-data.ts',
        envVars: ['STRIPE_SECRET_KEY'],
        description: 'Creates test customers with payment methods and metadata'
    },
    {
        name: 'HubSpot',
        script: 'scripts/seed-hubspot-data.ts',
        envVars: ['HUBSPOT_ACCESS_TOKEN'],
        optional: true,
        description: 'Creates test contacts and deals in HubSpot CRM'
    },
    {
        name: 'Intercom',
        script: 'scripts/seed-intercom-data.ts',
        envVars: ['INTERCOM_ACCESS_TOKEN'],
        optional: true,
        description: 'Creates test contacts in Intercom for customer support'
    },
    {
        name: 'SendGrid',
        script: 'scripts/seed-sendgrid-data.ts',
        envVars: ['SENDGRID_API_KEY'],
        optional: true,
        description: 'Creates test contacts in SendGrid for email marketing'
    },
    {
        name: 'Slack',
        script: 'scripts/seed-slack-data.ts',
        envVars: ['SLACK_BOT_TOKEN'],
        optional: true,
        description: 'Posts test messages with PII in Slack channels'
    },
    {
        name: 'Mixpanel',
        script: 'scripts/seed-mixpanel-data.ts',
        envVars: ['MIXPANEL_PROJECT_TOKEN'],
        optional: true,
        description: 'Creates test user profiles and events in Mixpanel analytics'
    },
    {
        name: 'MinIO',
        script: 'scripts/seed-minio-data.ts',
        envVars: ['MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'],
        optional: true,
        description: 'Creates test files and user data in MinIO object storage'
    }
]

function checkEnvironmentVariables(): { available: PlatformConfig[], missing: PlatformConfig[] } {
    const available: PlatformConfig[] = []
    const missing: PlatformConfig[] = []

    for (const platform of PLATFORMS) {
        const hasAllVars = platform.envVars.every(envVar => process.env[envVar])

        if (hasAllVars) {
            available.push(platform)
        } else {
            missing.push(platform)
        }
    }

    return { available, missing }
}

function runScript(scriptPath: string, args: string[] = []): Promise<{ success: boolean, output: string }> {
    return new Promise((resolve) => {
        const child = spawn('npx', ['tsx', scriptPath, ...args], {
            stdio: 'pipe',
            shell: true
        })

        let output = ''
        let errorOutput = ''

        child.stdout?.on('data', (data) => {
            const text = data.toString()
            output += text
            process.stdout.write(text)
        })

        child.stderr?.on('data', (data) => {
            const text = data.toString()
            errorOutput += text
            process.stderr.write(text)
        })

        child.on('close', (code) => {
            resolve({
                success: code === 0,
                output: output + errorOutput
            })
        })

        child.on('error', (error) => {
            resolve({
                success: false,
                output: `Failed to start process: ${error.message}`
            })
        })
    })
}

async function seedAllPlatforms() {
    console.log('🚀 Ghost Protocol - Master Seeding Script')
    console.log('='.repeat(60))
    console.log('This script will seed test data across all integrated platforms')
    console.log('for comprehensive GDPR deletion testing.\n')

    // Check environment variables
    const { available, missing } = checkEnvironmentVariables()

    console.log('🔍 Environment Check:')
    console.log(`   ✅ Available platforms: ${available.length}`)
    console.log(`   ⚠️  Missing credentials: ${missing.length}`)

    if (available.length === 0) {
        console.log('\n❌ No platforms available for seeding!')
        console.log('Please configure at least one platform in your .env file.\n')

        console.log('Required environment variables:')
        for (const platform of PLATFORMS) {
            console.log(`\n${platform.name}:`)
            for (const envVar of platform.envVars) {
                console.log(`   ${envVar}=your-${envVar.toLowerCase().replace('_', '-')}`)
            }
        }
        return
    }

    console.log('\n📋 Platforms to seed:')
    for (const platform of available) {
        console.log(`   ✅ ${platform.name}`)
        console.log(`      ${platform.description}`)
    }

    if (missing.length > 0) {
        console.log('\n⏭️  Skipping platforms (missing credentials):')
        for (const platform of missing) {
            console.log(`   ⚠️  ${platform.name}`)
            console.log(`      Missing: ${platform.envVars.join(', ')}`)
        }
    }

    console.log('\n' + '='.repeat(60))
    console.log('🌱 Starting seeding process...\n')

    const results: { platform: string, success: boolean, error?: string }[] = []

    // Seed each platform
    for (let i = 0; i < available.length; i++) {
        const platform = available[i]
        console.log(`\n[${i + 1}/${available.length}] Seeding ${platform.name}...`)
        console.log('-'.repeat(40))

        try {
            const args = platform.script.includes('database') ? ['seed'] :
                platform.script.includes('stripe') ? ['seed'] : []

            const result = await runScript(platform.script, args)

            if (result.success) {
                console.log(`✅ ${platform.name} seeded successfully`)
                results.push({ platform: platform.name, success: true })
            } else {
                console.log(`❌ ${platform.name} failed`)
                results.push({ platform: platform.name, success: false, error: 'Script failed' })
            }
        } catch (error: any) {
            console.log(`❌ ${platform.name} error: ${error.message}`)
            results.push({ platform: platform.name, success: false, error: error.message })
        }

        // Small delay between platforms
        if (i < available.length - 1) {
            console.log('\n⏳ Waiting 2 seconds before next platform...')
            await new Promise(r => setTimeout(r, 2000))
        }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 SEEDING SUMMARY')
    console.log('='.repeat(60))

    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)

    console.log(`✅ Successful: ${successful.length}`)
    for (const result of successful) {
        console.log(`   ✅ ${result.platform}`)
    }

    if (failed.length > 0) {
        console.log(`\n❌ Failed: ${failed.length}`)
        for (const result of failed) {
            console.log(`   ❌ ${result.platform}${result.error ? ` - ${result.error}` : ''}`)
        }
    }

    console.log('\n🎯 Test Data Created:')
    console.log('   Primary test user: gdpr.test@ghostprotocol.dev')
    console.log('   Secondary test user: gdpr.test2@ghostprotocol.dev')
    console.log('   Database user: gdpr_demo (gdpr.test@mail.com)')

    console.log('\n🧪 To test GDPR deletion, run:')
    console.log('   npm run dev                    # Start the server')
    console.log('   npm run test:e2e              # Run end-to-end GDPR test')
    console.log('   npm run demo:visual           # Visual demo of deletion process')

    console.log('\n📋 Manual API test:')
    console.log(`curl -X POST http://localhost:3000/erasure-request \\
  -H "Content-Type: application/json" \\
  -d '{
    "userIdentifiers": {
      "userId": "gdpr_test_user",
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
  }'`)

    if (successful.length === available.length) {
        console.log('\n🎉 All platforms seeded successfully!')
    } else {
        console.log(`\n⚠️  ${failed.length} platform(s) failed. Check logs above for details.`)
    }
}

// Handle command line arguments
const command = process.argv[2]

if (command === 'check') {
    console.log('🔍 Checking environment variables...\n')
    const { available, missing } = checkEnvironmentVariables()

    console.log(`✅ Available platforms: ${available.length}`)
    available.forEach(p => console.log(`   ✅ ${p.name}`))

    if (missing.length > 0) {
        console.log(`\n⚠️  Missing credentials: ${missing.length}`)
        missing.forEach(p => {
            console.log(`   ❌ ${p.name}`)
            console.log(`      Missing: ${p.envVars.join(', ')}`)
        })
    }
} else if (command === 'list') {
    console.log('📋 Available platforms:\n')
    PLATFORMS.forEach((p, i) => {
        console.log(`${i + 1}. ${p.name}${p.optional ? ' (optional)' : ''}`)
        console.log(`   ${p.description}`)
        console.log(`   Requires: ${p.envVars.join(', ')}\n`)
    })
} else if (command === 'help' || command === '--help' || command === '-h') {
    console.log('Ghost Protocol - Master Seeding Script\n')
    console.log('Usage:')
    console.log('  npx tsx scripts/seed-all-platforms.ts        # Seed all available platforms')
    console.log('  npx tsx scripts/seed-all-platforms.ts check  # Check environment setup')
    console.log('  npx tsx scripts/seed-all-platforms.ts list   # List all platforms')
    console.log('  npx tsx scripts/seed-all-platforms.ts help   # Show this help')
} else {
    // Default: run seeding
    seedAllPlatforms().catch(console.error)
}