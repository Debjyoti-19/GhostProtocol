/**
 * Sample chat/message exports for PII Agent testing
 * Simulates Slack, Intercom, and other messaging platform exports
 */

export interface ChatMessage {
  id: string
  timestamp: string
  sender: string
  channel: string
  text: string
  containsPII: boolean
  expectedPIITypes: string[]
}

/**
 * Sample Slack export messages with various PII patterns
 */
export const slackExportMessages: ChatMessage[] = [
  {
    id: 'msg_001',
    timestamp: '2024-01-15T10:30:00Z',
    sender: 'alice_j',
    channel: 'customer-support',
    text: 'Hi team, I need help with customer alice.johnson@example.com who is having issues with their account.',
    containsPII: true,
    expectedPIITypes: ['email', 'name']
  },
  {
    id: 'msg_002',
    timestamp: '2024-01-15T10:32:00Z',
    sender: 'support_agent',
    channel: 'customer-support',
    text: 'Sure, I can look into that. Can you provide their phone number? I see they called from +1-555-0101 earlier.',
    containsPII: true,
    expectedPIITypes: ['phone']
  },
  {
    id: 'msg_003',
    timestamp: '2024-01-15T10:35:00Z',
    sender: 'alice_j',
    channel: 'customer-support',
    text: 'Yes, that\'s correct. Their alternate email is alice.j@personal.com and they also use the alias ajohnson in our system.',
    containsPII: true,
    expectedPIITypes: ['email', 'alias']
  },
  {
    id: 'msg_004',
    timestamp: '2024-01-16T14:20:00Z',
    sender: 'bob_s',
    channel: 'sales',
    text: 'Just closed a deal with Bob Smith from Company Inc. His contact is bob.smith@company.com and phone +1-555-0202.',
    containsPII: true,
    expectedPIITypes: ['name', 'email', 'phone']
  },
  {
    id: 'msg_005',
    timestamp: '2024-01-16T14:25:00Z',
    sender: 'sales_manager',
    channel: 'sales',
    text: 'Great work! Make sure to add him to the CRM with both his work number +1-555-0202 and mobile +1-555-0203.',
    containsPII: true,
    expectedPIITypes: ['phone']
  },
  {
    id: 'msg_006',
    timestamp: '2024-01-17T09:00:00Z',
    sender: 'carol_w',
    channel: 'general',
    text: 'Hey everyone, I\'m Carol Williams and I just joined the team! You can reach me at carol.williams@example.org or my work email c.williams@work.com.',
    containsPII: true,
    expectedPIITypes: ['name', 'email']
  },
  {
    id: 'msg_007',
    timestamp: '2024-01-17T09:05:00Z',
    sender: 'team_lead',
    channel: 'general',
    text: 'Welcome Carol! I\'ll add your UK office number +44-20-7123-4567 to the directory.',
    containsPII: true,
    expectedPIITypes: ['name', 'phone']
  },
  {
    id: 'msg_008',
    timestamp: '2024-01-18T11:30:00Z',
    sender: 'david_chen',
    channel: 'engineering',
    text: 'Working on the authentication module today. No blockers.',
    containsPII: false,
    expectedPIITypes: []
  },
  {
    id: 'msg_009',
    timestamp: '2024-01-18T15:45:00Z',
    sender: 'emma_g',
    channel: 'customer-support',
    text: 'Customer Emma Garcia (emma.garcia@example.com) from Spain called about a refund. Her number is +34-91-123-4567.',
    containsPII: true,
    expectedPIITypes: ['name', 'email', 'phone']
  },
  {
    id: 'msg_010',
    timestamp: '2024-01-19T08:15:00Z',
    sender: 'frank_m',
    channel: 'customer-support',
    text: 'Frank Mueller (frank.mueller@example.de) needs urgent help. He\'s calling from +49-30-1234-5678. Also has work email f.mueller@company.de.',
    containsPII: true,
    expectedPIITypes: ['name', 'email', 'phone']
  },
  {
    id: 'msg_011',
    timestamp: '2024-01-19T10:00:00Z',
    sender: 'grace_k',
    channel: 'sales',
    text: 'Meeting scheduled with Grace Kim from Seoul. Contact: grace.kim@example.com, +82-2-1234-5678.',
    containsPII: true,
    expectedPIITypes: ['name', 'email', 'phone']
  },
  {
    id: 'msg_012',
    timestamp: '2024-01-20T13:30:00Z',
    sender: 'system',
    channel: 'general',
    text: 'System maintenance scheduled for tonight at 2 AM UTC. All services will be unavailable for 30 minutes.',
    containsPII: false,
    expectedPIITypes: []
  },
  {
    id: 'msg_013',
    timestamp: '2024-01-20T16:00:00Z',
    sender: 'henry_b',
    channel: 'customer-support',
    text: 'Old ticket from Henry Brown (henry.brown@example.com, h.brown@personal.com). Phone: +1-555-0808. No recent activity.',
    containsPII: true,
    expectedPIITypes: ['name', 'email', 'phone']
  }
]

/**
 * Sample Intercom conversation exports
 */
export const intercomConversations = [
  {
    conversationId: 'conv_001',
    userId: 'user_alice_001',
    messages: [
      {
        id: 'ic_msg_001',
        timestamp: '2024-01-10T14:00:00Z',
        sender: 'user',
        text: 'Hi, I\'m having trouble logging in with my email alice.johnson@example.com'
      },
      {
        id: 'ic_msg_002',
        timestamp: '2024-01-10T14:05:00Z',
        sender: 'agent',
        text: 'Hi Alice! I can help you with that. Can you confirm your phone number ending in 0101?'
      },
      {
        id: 'ic_msg_003',
        timestamp: '2024-01-10T14:07:00Z',
        sender: 'user',
        text: 'Yes, that\'s +1-555-0101. I also use alice.j@personal.com sometimes.'
      }
    ]
  },
  {
    conversationId: 'conv_002',
    userId: 'user_carol_003',
    messages: [
      {
        id: 'ic_msg_004',
        timestamp: '2024-01-12T09:30:00Z',
        sender: 'user',
        text: 'I need to update my billing information. My emails are carol.williams@example.org, c.williams@work.com, and carol@personal.net'
      },
      {
        id: 'ic_msg_005',
        timestamp: '2024-01-12T09:35:00Z',
        sender: 'agent',
        text: 'I can help with that Carol. I see your UK number +44-20-7123-4567 on file. Is that still current?'
      }
    ]
  },
  {
    conversationId: 'conv_003',
    userId: 'user_frank_006',
    messages: [
      {
        id: 'ic_msg_006',
        timestamp: '2024-01-14T11:00:00Z',
        sender: 'user',
        text: 'Guten Tag! I\'m Frank Mueller (frank.mueller@example.de) and I have a question about my subscription.'
      },
      {
        id: 'ic_msg_007',
        timestamp: '2024-01-14T11:05:00Z',
        sender: 'agent',
        text: 'Hello Frank! I can see your account. Your contact number is +49-30-1234-5678, correct?'
      }
    ]
  }
]

/**
 * Sample support ticket exports
 */
export const supportTickets = [
  {
    ticketId: 'ticket_001',
    userId: 'user_bob_002',
    subject: 'Billing Question',
    description: 'Hi, I\'m Bob Smith (bob.smith@company.com) and I have a question about my last invoice. You can reach me at +1-555-0202 or +1-555-0203.',
    status: 'closed',
    createdAt: '2024-01-05T10:00:00Z'
  },
  {
    ticketId: 'ticket_002',
    userId: 'user_david_004',
    subject: 'Feature Request',
    description: 'David Chen here (david.chen@startup.io). Would love to see dark mode. Contact: +1-555-0404',
    status: 'open',
    createdAt: '2024-01-18T15:30:00Z'
  },
  {
    ticketId: 'ticket_003',
    userId: 'user_emma_005',
    subject: 'Refund Request',
    description: 'Emma Garcia (emma.garcia@example.com) requesting refund. Phone: +34-91-123-4567',
    status: 'resolved',
    createdAt: '2024-01-08T12:00:00Z'
  }
]

/**
 * Get all messages containing PII for a specific user
 */
export function getMessagesForUser(userId: string): ChatMessage[] {
  const user = userId.toLowerCase()
  return slackExportMessages.filter(msg => 
    msg.text.toLowerCase().includes(user) || 
    msg.sender.toLowerCase().includes(user)
  )
}

/**
 * Get all conversations for a specific user
 */
export function getConversationsForUser(userId: string) {
  return intercomConversations.filter(conv => conv.userId === userId)
}

/**
 * Export all chat data as JSON (simulates export file)
 */
export function exportChatDataAsJSON() {
  return JSON.stringify({
    slack_messages: slackExportMessages,
    intercom_conversations: intercomConversations,
    support_tickets: supportTickets,
    exported_at: new Date().toISOString(),
    export_version: '1.0'
  }, null, 2)
}
