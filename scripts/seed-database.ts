/**
 * Seed PostgreSQL database with test users for GDPR demo
 * Run with: npx tsx scripts/seed-database.ts
 */

import 'dotenv/config'
import { Pool } from 'pg'

/* -------------------------------------------------------------------------- */
/*                                DB CONNECTION                               */
/* -------------------------------------------------------------------------- */

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
})

/* -------------------------------------------------------------------------- */
/*                               TABLE CREATION                               */
/* -------------------------------------------------------------------------- */

async function createTables() {
    console.log('📦 Creating tables...\n')

    await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      phone VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `)

    await pool.query(`
    CREATE TABLE IF NOT EXISTS user_data (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
      data_type VARCHAR(100),
      data_value TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `)

    await pool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
      session_token VARCHAR(255),
      ip_address VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `)

    console.log('✅ Tables created\n')
}

/* -------------------------------------------------------------------------- */
/*                                  SEED DATA                                 */
/* -------------------------------------------------------------------------- */

async function seedUsers() {
    console.log('🌱 Seeding users...\n')

    const users = [
        {
            id: 'user_001',
            email: 'john.doe@example.com',
            name: 'John Doe',
            phone: '+1234567890',
        },
        {
            id: 'user_002',
            email: 'jane.smith@example.com',
            name: 'Jane Smith',
            phone: '+1987654321',
        },
        {
            id: 'user_003',
            email: 'bob.wilson@example.com',
            name: 'Bob Wilson',
            phone: '+1555123456',
        },
        {
            id: 'user_004',
            email: 'alice.johnson@example.com',
            name: 'Alice Johnson',
            phone: '+1444789012',
        },
        {
            id: 'gdpr_demo',
            email: 'gdpr.test@mail.com',
            name: 'GDPR Test User',
            phone: '+1999888777',
        },
        {
            id: 'user_006',
            email: 'soumyadeepbhoumik@gmail.com',
            name: 'Soumyadeep Bhoumik',
            phone: '+1-666-555-4444',
        },
    ]

    for (const user of users) {
        try {
            await pool.query(
                `
        INSERT INTO users (id, email, name, phone)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id)
        DO UPDATE SET email = $2, name = $3, phone = $4;
        `,
                [user.id, user.email, user.name, user.phone]
            )

            console.log(`✅ User upserted: ${user.name} (${user.id})`)

            await pool.query(
                `
        INSERT INTO user_data (user_id, data_type, data_value)
        VALUES
          ($1, 'preferences', '{"theme":"dark","notifications":true}'),
          ($1, 'address', '{"street":"123 Main St","city":"San Francisco"}');
        `,
                [user.id]
            )

            await pool.query(
                `
        INSERT INTO user_sessions (user_id, session_token, ip_address)
        VALUES ($1, $2, $3);
        `,
                [
                    user.id,
                    `session_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    `192.168.1.${Math.floor(Math.random() * 255)}`,
                ]
            )
        } catch (error: any) {
            if (error.code === '23505') {
                console.log(`⏭️  User already exists: ${user.email}`)
            } else {
                console.error(`❌ Error seeding ${user.email}:`, error.message)
            }
        }
    }
}

/* -------------------------------------------------------------------------- */
/*                                  LIST DATA                                 */
/* -------------------------------------------------------------------------- */

async function listUsers() {
    console.log('\n📋 Users in database:\n')

    const users = await pool.query(`
    SELECT id, email, name, phone
    FROM users
    ORDER BY id;
  `)

    if (users.rows.length === 0) {
        console.log('   No users found')
        return
    }

    users.rows.forEach((u) => {
        console.log(`   ${u.id} | ${u.email} | ${u.name} | ${u.phone}`)
    })

    const dataCount = await pool.query('SELECT COUNT(*) FROM user_data')
    const sessionCount = await pool.query('SELECT COUNT(*) FROM user_sessions')

    console.log('\n📊 Record counts:')
    console.log(`   Users: ${users.rows.length}`)
    console.log(`   User data: ${dataCount.rows[0].count}`)
    console.log(`   Sessions: ${sessionCount.rows[0].count}`)
}

/* -------------------------------------------------------------------------- */
/*                                   MAIN                                     */
/* -------------------------------------------------------------------------- */

async function main() {
    const command = process.argv[2]

    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL not set')
        process.exit(1)
    }

    console.log('🔗 Connected to PostgreSQL\n')

    try {
        switch (command) {
            case 'seed':
                await createTables()
                await seedUsers()
                await listUsers()
                break

            case 'list':
                await listUsers()
                break

            case 'create-tables':
                await createTables()
                break

            default:
                console.log('Usage:')
                console.log('  npx tsx scripts/seed-database.ts seed')
                console.log('  npx tsx scripts/seed-database.ts list')
                console.log('  npx tsx scripts/seed-database.ts create-tables')
        }
    } catch (error: any) {
        console.error('❌ Database error:', error.message)
    } finally {
        await pool.end()
    }
}

main()
