/**
 * Error Notifications Stream for GhostProtocol
 * 
 * Provides real-time error streaming with detailed remediation information
 * for compliance teams and system administrators.
 * 
 * Requirements: 7.4
 */

import { StreamConfig } from 'motia'
import { z } from 'zod'

// Simplified schema for error notifications
export const errorNotificationSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  timestamp: z.string(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  category: z.enum([
    'VALIDATION_ERROR',
    'AUTHENTICATION_ERROR', 
    'SYSTEM_ERROR',
    'BUSINESS_LOGIC_ERROR',
    'INFRASTRUCTURE_ERROR',
    'EXTERNAL_API_ERROR',
    'LEGAL_HOLD_ERROR'
  ]),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.string().optional(),
    stackTrace: z.string().optional()
  }),
  remediation: z.object({
    description: z.string(),
    actions: z.array(z.string()),
    retryable: z.boolean(),
    escalationRequired: z.boolean()
  }),
  metadata: z.record(z.any()).optional()
})

export type ErrorNotification = z.infer<typeof errorNotificationSchema>

// Stream configuration with role-based access
export const config: StreamConfig = {
  name: 'errorNotifications',
  schema: errorNotificationSchema,
  baseConfig: { storageType: 'default' },
  
  // Authentication for error monitoring access
  canAccess: async (subscription, authContext) => {
    // Check if user has appropriate role for error monitoring
    if (!authContext?.user) {
      return false
    }

    const allowedRoles = ['System Admin', 'Compliance Admin', 'Legal', 'Technical Support']
    return allowedRoles.includes(authContext.user.role)
  }
}