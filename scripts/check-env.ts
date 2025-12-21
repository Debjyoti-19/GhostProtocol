/**
 * Environment Configuration Checker
 * 
 * Checks your .env file and provides guidance on setting up
 * credentials for all supported platforms.
 * 
 * Run: npx tsx scripts/check-env.ts
 */

import { config } from 'dotenv'
import { readFileSync, existsSync } from 'fs'

// Load environment variables
config()

interface EnvCheck {
    name: string
    required: string[]
    optional: string[]
    description: string
    setupInstructions: string[]
}

const ENV_CHECKS: EnvCheck[] = [
    {
        name: 'PostgreSQL Database',
        required: ['DATABASE_URL'],
        optional: [],
        description: 'Primary database for user data storage',
        setupInstructions: [
            'Install PostgreSQL locally or use a cloud service',
            'Create a database (e.g., "ghost_protocol")',
            'Set DATABASE_URL=postgresql://user:password@localhost:5432/ghost_protocol'
        ]
    },
    {
        name: 'Stripe',
        required: ['STRIPE_SECRET_KEY'],
        optional: ['STRIPE_PUBLISHABLE_KEY'],
        description: 'Payment processing and customer data',
        setupInstructions: [
            'Go to https://dashboard.stripe.com/apikeys',
            'Copy the Secret key (starts with sk_test_)',
            'Set STRIPE_SECRET_KEY=sk_test_your_key'
        ]
    },
    {
        name: 'HubSpot',
        required: ['HUBSPOT_ACCESS_TOKEN'],
        optional: [],
        description: 'CRM and contact management',
        setupInstructions: [
            'Go to https://app.hubspot.com/private-apps',
            'Create a private app with contacts and deals scopes',
            'Copy the access token',
            'Set HUBSPOT_ACCESS_TOKEN=your_token'
        ]
    },
    {
        name: 'Intercom',
        required: ['INTERCOM_ACCESS_TOKEN'],
        optional: [],
        description: 'Customer support and messaging',
        setupInstructions: [
            'Go to https://app.intercom.com/a/apps/_/developer-hub',
            'Create or select an app',
            'Go to Authentication tab and copy Access Token',
            'Set INTERCOM_ACCESS_TOKEN=your_token'
        ]
    },
    {
        name: 'SendGrid',
        required: ['SENDGRID_API_KEY'],
        optional: [],
        description: 'Email marketing and transactional emails',
        setupInstructions: [
            'Go to https://app.sendgrid.com/settings/api_keys',
            'Create API Key with Full Access',
            'Set SENDGRID_API_KEY=SG.your_key'
        ]
    },
    {
        name: 'Slack',
        required: ['SLACK_BOT_TOKEN'],
        optional: ['SLACK_SIGNING_SECRET'],
        description: 'Team communication and message scanning',
        setupInstructions: [
            'Go to https://api.slack.com/apps',
            'Create a new app or select existing',
            'Go to OAuth & Permissions, add bot scopes: channels:read, chat:write, groups:read',
            'Install app to workspace and copy Bot User OAuth Token',
            'Set SLACK_BOT_TOKEN=xoxb-your-token'
        ]
    },
    {
        name: 'Mixpanel',
        required: ['MIXPANEL_PROJECT_TOKEN'],
        optional: ['MIXPANEL_SECRET'],
        description: 'Analytics and user behavior tracking',
        setupInstructions: [
            'Go to https://mixpanel.com/settings/project',
            'Copy the Project Token',
            'Set MIXPANEL_PROJECT_TOKEN=your_token'
        ]
    },
    {
        name: 'MinIO',
        required: ['MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'],
        optional: ['MINIO_ENDPOINT', 'MINIO_PORT', 'MINIO_BUCKET', 'MINIO_USE_SSL'],
        description: 'Object storage for files and backups',
        setupInstructions: [
            'Install MinIO locally: docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"',
            'Or use MinIO cloud service',
            'Set MINIO_ACCESS_KEY=minioadmin',
            'Set MINIO_SECRET_KEY=minioadmin',
            'Optional: MINIO_ENDPOINT=localhost, MINIO_PORT=9000'
        ]
    }
]

function checkEnvFile(): string[] {
    const envPath = '.env'
    if (!existsSync(envPath)) {
        return []
    }

    try {
        const content = readFileSync(envPath, 'utf-8')
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => line.split('=')[0])
    } catch {
        return []
    }
}

function checkEnvironment() {
    console.log('🔍 Ghost Protocol - Environment Configuration Check')
    console.log('='.repeat(60))

    const envVars = checkEnvFile()
    const hasEnvFile = envVars.length > 0

    if (!hasEnvFile) {
        console.log('❌ No .env file found!')
        console.log('\nCreate a .env file in your project root with the following structure:')
        console.log('\n# Database (Required)')
        console.log('DATABASE_URL=postgresql://user:password@localhost:5432/ghost_protocol')
        console.log('\n# Payment Processing (Required)')
        console.log('STRIPE_SECRET_KEY=sk_test_your_stripe_key')
        console.log('\n# Optional Services')
        console.log('HUBSPOT_ACCESS_TOKEN=your_hubspot_token')
        console.log('INTERCOM_ACCESS_TOKEN=your_intercom_token')
        console.log('SENDGRID_API_KEY=SG.your_sendgrid_key')
        console.log('SLACK_BOT_TOKEN=xoxb-your-slack-token')
        console.log('MIXPANEL_PROJECT_TOKEN=your_mixpanel_token')
        console.log('MINIO_ACCESS_KEY=minioadmin')
        console.log('MINIO_SECRET_KEY=minioadmin')
        return
    }

    console.log(`✅ Found .env file with ${envVars.length} variables\n`)

    let totalRequired = 0
    let totalConfigured = 0
    let readyPlatforms = 0

    for (const check of ENV_CHECKS) {
        const requiredVars = check.required
        const optionalVars = check.optional
        const allVars = [...requiredVars, ...optionalVars]

        totalRequired += requiredVars.length

        const configuredRequired = requiredVars.filter(v => process.env[v])
        const configuredOptional = optionalVars.filter(v => process.env[v])
        const configuredTotal = configuredRequired.length + configuredOptional.length

        totalConfigured += configuredRequired.length

        const isReady = configuredRequired.length === requiredVars.length
        if (isReady) readyPlatforms++

        console.log(`${isReady ? '✅' : '⚠️ '} ${check.name}`)
        console.log(`   ${check.description}`)

        if (isReady) {
            console.log(`   Ready to use! (${configuredTotal}/${allVars.length} vars configured)`)
        } else {
            console.log(`   Missing required: ${requiredVars.filter(v => !process.env[v]).join(', ')}`)
        }

        // Show configured variables
        if (configuredTotal > 0) {
            const configured = [
                ...configuredRequired.map(v => `${v} ✅`),
                ...configuredOptional.map(v => `${v} (optional) ✅`)
            ]
            console.log(`   Configured: ${configured.join(', ')}`)
        }

        console.log()
    }

    // Summary
    console.log('='.repeat(60))
    console.log('📊 CONFIGURATION SUMMARY')
    console.log('='.repeat(60))
    console.log(`✅ Ready platforms: ${readyPlatforms}/${ENV_CHECKS.length}`)
    console.log(`📋 Required variables: ${totalConfigured}/${totalRequired} configured`)

    if (readyPlatforms === 0) {
        console.log('\n❌ No platforms are ready!')
        console.log('You need at least DATABASE_URL and STRIPE_SECRET_KEY to get started.')
    } else if (readyPlatforms < ENV_CHECKS.length) {
        console.log(`\n⚠️  ${ENV_CHECKS.length - readyPlatforms} platform(s) need configuration.`)
        console.log('Optional platforms can be configured later.')
    } else {
        console.log('\n🎉 All platforms are configured!')
    }

    // Show setup instructions for missing platforms
    const missingPlatforms = ENV_CHECKS.filter(check =>
        !check.required.every(v => process.env[v])
    )

    if (missingPlatforms.length > 0) {
        console.log('\n📋 SETUP INSTRUCTIONS')
        console.log('='.repeat(60))

        for (const platform of missingPlatforms) {
            console.log(`\n${platform.name}:`)
            platform.setupInstructions.forEach((instruction, i) => {
                console.log(`   ${i + 1}. ${instruction}`)
            })
        }
    }

    console.log('\n🚀 Next Steps:')
    if (readyPlatforms > 0) {
        console.log('   npx tsx scripts/seed-all-platforms.ts     # Seed available platforms')
        console.log('   npm run dev                               # Start development server')
        console.log('   npm run test:e2e                         # Test GDPR deletion')
    } else {
        console.log('   1. Configure at least DATABASE_URL and STRIPE_SECRET_KEY')
        console.log('   2. Run this script again to verify')
        console.log('   3. Run seed-all-platforms.ts to create test data')
    }
}

checkEnvironment()