/**
 * Sample user data for GhostProtocol demo
 * Represents users across multiple systems with various data patterns
 */

import { UserIdentifiers } from '../types/index.js'

export interface DemoUser {
  identifiers: UserIdentifiers
  stripeCustomerId?: string
  intercomUserId?: string
  sendgridContactId?: string
  crmContactId?: string
  jurisdiction: 'EU' | 'US' | 'OTHER'
  hasActiveSubscription: boolean
  conversationCount: number
  orderCount: number
  description: string
}

/**
 * Demo users representing different scenarios
 */
export const demoUsers: DemoUser[] = [
  {
    identifiers: {
      userId: 'user_alice_001',
      emails: ['alice.johnson@example.com', 'alice.j@personal.com'],
      phones: ['+1-555-0101'],
      aliases: ['alice_j', 'ajohnson']
    },
    stripeCustomerId: 'cus_alice_stripe_001',
    intercomUserId: 'ic_alice_001',
    sendgridContactId: 'sg_alice_001',
    crmContactId: 'crm_alice_001',
    jurisdiction: 'EU',
    hasActiveSubscription: true,
    conversationCount: 15,
    orderCount: 8,
    description: 'EU user with active subscription and extensive conversation history'
  },
  {
    identifiers: {
      userId: 'user_bob_002',
      emails: ['bob.smith@company.com'],
      phones: ['+1-555-0202', '+1-555-0203'],
      aliases: ['bsmith', 'bob_s']
    },
    stripeCustomerId: 'cus_bob_stripe_002',
    intercomUserId: 'ic_bob_002',
    sendgridContactId: 'sg_bob_002',
    crmContactId: 'crm_bob_002',
    jurisdiction: 'US',
    hasActiveSubscription: false,
    conversationCount: 3,
    orderCount: 2,
    description: 'US user with canceled subscription, minimal data'
  },
  {
    identifiers: {
      userId: 'user_carol_003',
      emails: ['carol.williams@example.org', 'c.williams@work.com', 'carol@personal.net'],
      phones: ['+44-20-7123-4567'],
      aliases: ['carol_w', 'cwilliams', 'carol123']
    },
    stripeCustomerId: 'cus_carol_stripe_003',
    intercomUserId: 'ic_carol_003',
    sendgridContactId: 'sg_carol_003',
    crmContactId: 'crm_carol_003',
    jurisdiction: 'EU',
    hasActiveSubscription: true,
    conversationCount: 42,
    orderCount: 25,
    description: 'Power user with multiple identifiers and extensive data footprint'
  },
  {
    identifiers: {
      userId: 'user_david_004',
      emails: ['david.chen@startup.io'],
      phones: ['+1-555-0404'],
      aliases: ['dchen']
    },
    stripeCustomerId: 'cus_david_stripe_004',
    intercomUserId: 'ic_david_004',
    sendgridContactId: 'sg_david_004',
    jurisdiction: 'US',
    hasActiveSubscription: true,
    conversationCount: 7,
    orderCount: 12,
    description: 'US user with active subscription, moderate usage'
  },
  {
    identifiers: {
      userId: 'user_emma_005',
      emails: ['emma.garcia@example.com'],
      phones: ['+34-91-123-4567'],
      aliases: ['emma_g']
    },
    stripeCustomerId: 'cus_emma_stripe_005',
    intercomUserId: 'ic_emma_005',
    sendgridContactId: 'sg_emma_005',
    crmContactId: 'crm_emma_005',
    jurisdiction: 'EU',
    hasActiveSubscription: false,
    conversationCount: 1,
    orderCount: 1,
    description: 'EU user with minimal activity, single purchase'
  },
  {
    identifiers: {
      userId: 'user_frank_006',
      emails: ['frank.mueller@example.de', 'f.mueller@company.de'],
      phones: ['+49-30-1234-5678'],
      aliases: ['frank_m', 'fmueller']
    },
    stripeCustomerId: 'cus_frank_stripe_006',
    intercomUserId: 'ic_frank_006',
    sendgridContactId: 'sg_frank_006',
    crmContactId: 'crm_frank_006',
    jurisdiction: 'EU',
    hasActiveSubscription: true,
    conversationCount: 28,
    orderCount: 18,
    description: 'EU user with active subscription, frequent support interactions'
  },
  {
    identifiers: {
      userId: 'user_grace_007',
      emails: ['grace.kim@example.com'],
      phones: ['+82-2-1234-5678'],
      aliases: ['grace_k', 'gkim']
    },
    stripeCustomerId: 'cus_grace_stripe_007',
    intercomUserId: 'ic_grace_007',
    sendgridContactId: 'sg_grace_007',
    jurisdiction: 'OTHER',
    hasActiveSubscription: true,
    conversationCount: 5,
    orderCount: 10,
    description: 'Non-EU/US user (South Korea), active subscription'
  },
  {
    identifiers: {
      userId: 'user_henry_008',
      emails: ['henry.brown@example.com', 'h.brown@personal.com'],
      phones: ['+1-555-0808'],
      aliases: ['henry_b']
    },
    stripeCustomerId: 'cus_henry_stripe_008',
    intercomUserId: 'ic_henry_008',
    sendgridContactId: 'sg_henry_008',
    crmContactId: 'crm_henry_008',
    jurisdiction: 'US',
    hasActiveSubscription: false,
    conversationCount: 0,
    orderCount: 0,
    description: 'Zombie data scenario - user with no recent activity but data remains'
  }
]

/**
 * Get a demo user by userId
 */
export function getDemoUser(userId: string): DemoUser | undefined {
  return demoUsers.find(user => user.identifiers.userId === userId)
}

/**
 * Get demo users by jurisdiction
 */
export function getDemoUsersByJurisdiction(jurisdiction: 'EU' | 'US' | 'OTHER'): DemoUser[] {
  return demoUsers.filter(user => user.jurisdiction === jurisdiction)
}

/**
 * Get a random demo user
 */
export function getRandomDemoUser(): DemoUser {
  return demoUsers[Math.floor(Math.random() * demoUsers.length)]
}
