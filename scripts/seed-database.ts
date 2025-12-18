/**
 * Seed PostgreSQL database with test users for GDPR demo
 * Run with: npx tsx scripts/seed-database.ts
 */

import 'dotenv/config'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

async function createTables() {
  console.log('📦 Creating tables...')
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      phone VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_data (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
      data_type VARCHAR(100),
      data_value TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
      session_token VARCHAR(255),
      ip_address VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `)

  console.log('✅ Tables created\n')
}

async function seedUsers() {
  console.log('🌱 Seeding users...\n')

  const users = [
    { id: 'user_001', email: 'john.doe@example.com', name: 'John Doe', phone: '+1234567890' },
    { id: 'user_002', email: 'jane.smith@example.com', name: 'Jane Smith', phone: '+1987654321' },
    { id: 'user_003', email: 'bob.wilson@example.com', name: 'Bob Wilson', phone: '+1555123456' },
    { id: 'user_004', email: 'alice.johnson@example.com', name: 'Alice Johnson', phone: '+1444789012' },
    { id: 'gdpr_demo', email: 'gdpr.test@mail.com', name: 'GDPR Test User', phone: '+1999888777' },
  ]

  for (const user of users) {
    try {
      // Insert user
      await pool.query(
        `INSERT INTO users (id, email, name, phone) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET email = $2, name = $3, phone = $4`,
        [user.id, user.email, user.name, user.phone]
      )
      console.log(`✅ Created user: ${user.name} (${user.id})`)

      // Add some user data
      await pool.query(
        `INSERT INTO user_data (user_id, data_type, data_value) VALUES ($1, 'preferences', '{"theme": "dark", "notifications": true}')
         ON CONFLICT DO NOTHING`,
        [user.id]
      )
      await pool.query(
        `INSERT INTO user_data (user_id, data_type, data_value) VALUES ($1, 'address', '{"street": "123 Main St", "city": "San Francisco"}')
         ON CONFLICT DO NOTHING`,
        [user.id]
      )

      // Add some sessions
      await pool.query(
        `INSERT INTO user_sessions (user_id, session_token, ip_address) VALUES ($1, $2, $3)`,
        [user.id, `session_${Date.now()}_${Math.random().toString(36).slice(2)}`, '192.168.1.' + Math.floor(Math.random() * 255)]
      )

    } catch (error: any) {
      if (error.code === '23505') {
        console.log(`⏭️  User ${user.email} already exists`)
      } else {
        console.error(`❌ Error creating ${user.email}:`, error.message)
      }
    }
  }
}

async function listUsers() {
  console.log('\n📋 Current users in database:\n')
  
  const result = await pool.query('SELECT id, email, name, phone FROM users ORDER BY id')
  
  if (result.rows.length === 0) {
    console.log('   No users found')
    return
  }

  result.rows.forEach(user => {
    console.log(`   ${user.id} | ${user.email} | ${user.name}`)
  })

  // Count related data
  const dataCount = await pool.query('SELECT COUNT(*) FROM user_data')
  const sessionCount = await pool.query('SELECT COUNT(*) FROM user_sessions')
  
  console.log(`\n📊 Total records:`)
  console.log(`   - Users: ${result.rows.length}`)
  console.log(`   - User data: ${dataCount.rows[0].count}`)
  console.log(`   - Sessions: ${sessionCount.rows[0].count}`)
}

async function main() {
  const command = process.argv[2]

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set in .env file')
    process.exit(1)
  }

  console.log('🔗 Connecting to PostgreSQL...\n')

  try {
    if (command === 'list') {
      await listUsers()
    } else if (command === 'seed') {
      await createTables()
      await seedUsers()
      await listUsers()
    } else if (command === 'create-tables') {
      await createTables()
    } else {
      console.log('Usage:')
      console.log('  npx tsx scripts/seed-database.ts seed          # Create tables and seed users')
      console.log('  npx tsx scripts/seed-database.ts list          # List existing users')
      console.log('  npx tsx scripts/seed-database.ts create-tables # Create tables only')
    }
  } catch (error: any) {
    console.error('❌ Database error:', error.message)
  } finally {
    await pool.end()
  }
}

main()
