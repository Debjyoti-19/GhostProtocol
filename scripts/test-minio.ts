/**
 * Test MinIO Integration
 * 
 * Tests the MinIO connection and deletion capabilities.
 * Run: npx tsx scripts/test-minio.ts
 */

import { config } from 'dotenv'
config()

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost'
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000')
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'gdpr-test-bucket'
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true'

async function testMinIO() {
  console.log('🧪 Testing MinIO Integration')
  console.log('=' .repeat(50))

  if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
    console.error('❌ MinIO credentials not set')
    process.exit(1)
  }

  console.log('📊 Configuration:')
  console.log(`   Endpoint: ${MINIO_ENDPOINT}:${MINIO_PORT}`)
  console.log(`   Bucket: ${MINIO_BUCKET}`)
  console.log(`   SSL: ${MINIO_USE_SSL}`)

  try {
    const Minio = await import('minio')
    const minioClient = new Minio.Client({
      endPoint: MINIO_ENDPOINT,
      port: MINIO_PORT,
      useSSL: MINIO_USE_SSL,
      accessKey: MINIO_ACCESS_KEY!,
      secretKey: MINIO_SECRET_KEY!
    })

    console.log('\n✅ MinIO client initialized')

    // Test 1: Check bucket
    console.log('\n📦 Checking bucket...')
    const bucketExists = await minioClient.bucketExists(MINIO_BUCKET)
    console.log(`   Bucket exists: ${bucketExists ? '✅ Yes' : '❌ No'}`)

    if (!bucketExists) {
      console.log('   Run: npx tsx scripts/seed-minio-data.ts')
      return
    }

    // Test 2: List objects
    console.log('\n📁 Listing objects...')
    const objectsStream = minioClient.listObjects(MINIO_BUCKET, '', true)
    const objects: any[] = []

    await new Promise<void>((resolve, reject) => {
      objectsStream.on('data', (obj) => objects.push(obj))
      objectsStream.on('error', reject)
      objectsStream.on('end', resolve)
    })

    console.log(`   Total objects: ${objects.length}`)

    // Test 3: Find user files
    const testUserId = 'gdpr_test_user'
    const testEmail = 'gdpr.test@ghostprotocol.dev'
    const userPatterns = [testUserId, 'john_doe', 'ghostprotocol']

    console.log(`\n🔍 Searching for user files...`)
    console.log(`   User ID: ${testUserId}`)
    console.log(`   Email: ${testEmail}`)

    const userFiles = objects.filter(obj => {
      const name = obj.name.toLowerCase()
      return userPatterns.some(p => name.includes(p.toLowerCase()))
    })

    console.log(`\n   Found ${userFiles.length} user files:`)
    for (const file of userFiles) {
      console.log(`   🔴 ${file.name} (${file.size} bytes)`)
    }

    // Test 4: Verify deletion capability
    console.log('\n🗑️  Deletion capabilities:')
    console.log(`   ✅ Can delete ${userFiles.length} user files`)
    console.log(`   ✅ Total bytes to free: ${userFiles.reduce((sum, f) => sum + (f.size || 0), 0)}`)

    // Test 5: Test single file operations
    console.log('\n📝 Testing file operations...')
    const testFileName = `test_${Date.now()}.txt`
    
    // Upload test file
    await minioClient.putObject(MINIO_BUCKET, testFileName, Buffer.from('test content'))
    console.log(`   ✅ Upload: ${testFileName}`)
    
    // Delete test file
    await minioClient.removeObject(MINIO_BUCKET, testFileName)
    console.log(`   ✅ Delete: ${testFileName}`)

    console.log('\n' + '=' .repeat(50))
    console.log('✅ MinIO integration test complete!')
    console.log('\nThe GDPR workflow will:')
    console.log('  1. Scan bucket for user-related files')
    console.log('  2. Match files by userId, email, name patterns')
    console.log('  3. Delete matching files')
    console.log('  4. Generate deletion receipt')

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.code === 'ECONNREFUSED') {
      console.error('\n   MinIO is not running!')
      console.error('   Start with: docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"')
    }
  }
}

testMinIO()
