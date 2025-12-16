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

// Schema for completion notifications
export const completionNotificationSchema = z.object({
  id: z.string().uuid('Invalid notification ID format'),
  workflowId: z.string().uuid('Invalid workflow ID format'),
  timestamp: z.string().datetime('Invalid datetime format'),
  type: z.enum(['WORKFLOW_COMPLETED', 'CERTIFICATE_GENERATED', 'ZOMBIE_CHECK_COMPLETED']),
  status: z.enum(['COMPLETED', 'COMPLETED_WITH_EXCEPTIONS']),
  summary: z.object({
    userIdentifiers: z.object({
      userId: z.string(),
      emailCount: z.number().int().min(0),
      phoneCount: z.number().int().min(0),
      aliasCount: z.number().int().min(0)
    }),
    duration: z.object({
      startedAt: z.string().datetime(),
      completedAt: z.string().datetime(),
      totalMinutes: z.number().min(0)
    }),
    systems: z.object({
      total: z.number().int().min(0),
      deleted: z.number().int().min(0),
      failed: z.number().int().min(0),
      legalHolds: z.number().int().min(0)
    }),
    backgroundJobs: z.object({
      total: z.number().int().min(0),
      completed: z.number().int().min(0),
      failed: z.number().int().min(0),
      piiFindings: z.number().int().min(0)
    })
  }),
  certificate: z.object({
    certificateId: z.string().uuid(),
    downloadUrl: z.string().url().optional(),
    auditHashRoot: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid SHA-256 hash format'),
    signature: z.string()
  }).optional(),
  exceptions: z.array(z.object({
    system: z.string(),
    error: z.string(),
    remediation: z.string()
  })).optional(),
  legalHolds: z.array(z.object({
    system: z.string(),
    reason: z.string(),
    expiresAt: z.string().datetime().optional()
  })).optional(),
  nextActions: z.array(z.object({
    action: z.string(),
    dueDate: z.string().datetime().optional(),
    assignedTo: z.string().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH'])
  })).optional(),
  compliance: z.object({
    jurisdiction: z.enum(['EU', 'US', 'OTHER']),
    policyVersion: z.string(),
    zombieCheckScheduled: z.boolean(),
    zombieCheckDate: z.string().datetime().optional()
  }),
  metadata: z.record(z.any()).optional()
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