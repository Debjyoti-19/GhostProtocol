/**
 * Completion Notifications Stream for GhostProtocol
 * 
 * Provides real-time completion notifications for compliance teams
 * when workflows finish, including certificate generation and audit summaries.
 * 
 * Requirements: 7.5
 */

import { StreamConfig } from 'motia'
import { z } from 'zod'

// Simplified schema for completion notifications
export const completionNotificationSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  timestamp: z.string(),
  type: z.enum(['WORKFLOW_COMPLETED', 'CERTIFICATE_GENERATED', 'ZOMBIE_CHECK_COMPLETED']),
  status: z.enum(['COMPLETED', 'COMPLETED_WITH_EXCEPTIONS']),
  summary: z.object({
    userIdentifiers: z.object({
      userId: z.string(),
      emailCount: z.number(),
      phoneCount: z.number(),
      aliasCount: z.number()
    }),
    duration: z.object({
      startedAt: z.string(),
      completedAt: z.string(),
      totalMinutes: z.number()
    }),
    systems: z.object({
      total: z.number(),
      deleted: z.number(),
      failed: z.number(),
      legalHolds: z.number()
    }),
    backgroundJobs: z.object({
      total: z.number(),
      completed: z.number(),
      failed: z.number(),
      piiFindings: z.number()
    }).optional()
  }),
  certificateId: z.string().optional(),
  certificate: z.object({
    certificateId: z.string(),
    auditHashRoot: z.string(),
    signature: z.string()
  }).optional(),
  legalHolds: z.array(z.object({
    system: z.string(),
    reason: z.string(),
    expiresAt: z.string().optional()
  })).optional(),
  compliance: z.object({
    jurisdiction: z.enum(['EU', 'US', 'OTHER']),
    policyVersion: z.string(),
    zombieCheckScheduled: z.boolean(),
    zombieCheckDate: z.string().optional()
  }),
  nextActions: z.array(z.object({
    action: z.string(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    dueDate: z.string()
  })).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
})

export type CompletionNotification = z.infer<typeof completionNotificationSchema>

// Stream configuration with compliance team access
export const config: StreamConfig = {
  name: 'completionNotifications',
  schema: completionNotificationSchema,
  baseConfig: { storageType: 'default' },
  
  // Authentication for completion notifications
  canAccess: async (subscription, authContext) => {
    // Check if user has appropriate role for completion notifications
    if (!authContext?.user) {
      return false
    }

    const allowedRoles = ['Legal', 'Compliance Admin', 'Auditor', 'Data Protection Officer']
    return allowedRoles.includes(authContext.user.role)
  }
}