/**
 * Seed MinIO Test Data
 * 
 * Creates test files in MinIO bucket for GDPR deletion testing.
 * Run: npx tsx scripts/seed-minio-data.ts
 */

import { config } from 'dotenv'
config()

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost'
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000')
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'gdpr-test-bucket'
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true'

if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
  console.error('❌ MinIO credentials not set in .env')
  console.log('\nRequired:')
  console.log('  MINIO_ACCESS_KEY=minioadmin')
  console.log('  MINIO_SECRET_KEY=minioadmin')
  process.exit(1)
}

// Test files to create (simulating user data)
const TEST_FILES = [
  {
    name: 'users/gdpr_test_user/profile.json',
    content: JSON.stringify({
      userId: 'gdpr_test_user',
      email: 'gdpr.test@ghostprotocol.dev',
      name: 'John Doe',
      phone: '+1-555-123-4567',
      created: new Date().toISOString()
    }, null, 2)
  },
  {
    name: 'users/gdpr_test_user/settings.json',
    content: JSON.stringify({
      theme: 'dark',
      notifications: true,
      language: 'en'
    }, null, 2)
  },
  {
    name: 'backups/gdpr_test_ghostprotocol_dev_backup.zip',
    content: 'MOCK_BACKUP_DATA_FOR_USER_gdpr.test@ghostprotocol.dev'
  },
  {
    name: 'exports/john_doe_export_2024.csv',
    content: 'id,email,name\n1,gdpr.test@ghostprotocol.dev,John Doe'
  },
  {
    name: 'logs/user_activity_gdpr_test_user.log',
    content: '2024-01-01 Login from 192.168.1.1\n2024-01-02 Updated profile'
  },
  {
    name: 'shared/public_document.txt',
    content: 'This is a public document - should NOT be deleted'
  },
  {
    name: 'shared/team_notes.md',
    content: '# Team Notes\nNo PII here'
  },
  {
    name: 'users/soumyadeep_user/profile.json',
    content: JSON.stringify({
      userId: 'soumyadeep_user',
      email: 'soumyadeepbhoumik@gmail.com',
      name: 'Soumyadeep Bhoumik',
      phone: '+1-666-555-4444',
      created: new Date().toISOString()
    }, null, 2)
  },
  {
    name: 'users/soumyadeep_user/settings.json',
    content: JSON.stringify({
      theme: 'light',
      notifications: false,
      language: 'en-IN'
    }, null, 2)
  },
  {
    name: 'exports/soumyadeep_bhoumik_export_2024.csv',
    content: 'id,email,name\n2,soumyadeepbhoumik@gmail.com,Soumyadeep Bhoumik'
  },
  {
    name: 'backups/soumyadeepbhoumik@gmail.com',
    content: 'MOCK_BACKUP_DATA_FOR_USER_soumyadeepbhoumik@gmail.com'
  }
]

async function seedMinIOData() {
  console.log('🚀 Seeding MinIO Test Data')
  console.log('='.repeat(50))

  try {
    const Minio = await import('minio')
    const minioClient = new Minio.Client({
      endPoint: MINIO_ENDPOINT,
      port: MINIO_PORT,
      useSSL: MINIO_USE_SSL,
      accessKey: MINIO_ACCESS_KEY!,
      secretKey: MINIO_SECRET_KEY!
    })

    console.log('✅ MinIO client initialized')
    console.log(`   Endpoint: ${MINIO_ENDPOINT}:${MINIO_PORT}`)
    console.log(`   Bucket: ${MINIO_BUCKET}`)

    // Create bucket if it doesn't exist
    console.log('\n📦 Checking bucket...')
    const bucketExists = await minioClient.bucketExists(MINIO_BUCKET)

    if (!bucketExists) {
      await minioClient.makeBucket(MINIO_BUCKET)
      console.log(`   ✅ Created bucket: ${MINIO_BUCKET}`)
    } else {
      console.log(`   ✅ Bucket exists: ${MINIO_BUCKET}`)
    }

    // Upload test files
    console.log('\n📁 Uploading test files...')

    let uploadedCount = 0
    for (const file of TEST_FILES) {
      try {
        const buffer = Buffer.from(file.content)
        await minioClient.putObject(MINIO_BUCKET, file.name, buffer)
        console.log(`   ✅ ${file.name} (${buffer.length} bytes)`)
        uploadedCount++
      } catch (err: any) {
        console.log(`   ❌ ${file.name}: ${err.message}`)
      }
    }

    // List all objects
    console.log('\n📋 Current bucket contents:')
    const objectsStream = minioClient.listObjects(MINIO_BUCKET, '', true)
    const objects: any[] = []

    await new Promise<void>((resolve, reject) => {
      objectsStream.on('data', (obj) => objects.push(obj))
      objectsStream.on('error', reject)
      objectsStream.on('end', resolve)
    })

    for (const obj of objects) {
      const isUserFile = obj.name.includes('gdpr_test') ||
        obj.name.includes('john_doe') ||
        obj.name.includes('ghostprotocol') ||
        obj.name.includes('soumyadeep')
      console.log(`   ${isUserFile ? '🔴' : '⚪'} ${obj.name} (${obj.size} bytes)`)
    }

    console.log('\n' + '='.repeat(50))
    console.log('📊 Summary:')
    console.log(`   Files uploaded: ${uploadedCount}`)
    console.log(`   Total in bucket: ${objects.length}`)
    console.log(`   User files (🔴): ${objects.filter(o =>
      o.name.includes('gdpr_test') || o.name.includes('john_doe') || o.name.includes('ghostprotocol') || o.name.includes('soumyadeep')
    ).length}`)

    console.log('\n✅ MinIO test data seeded!')
    console.log('   The workflow will scan and delete files matching user identifiers.')

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.code === 'ECONNREFUSED') {
      console.error('\n   MinIO is not running!')
      console.error('   Start it with: docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"')
    }
  }
}

seedMinIOData()
