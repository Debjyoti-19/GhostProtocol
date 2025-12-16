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

// Schema for error notifications
export const errorNotificationSchema = z.object({
  id: z.string().uuid('Invalid error ID format'),
  workflowId: z.string().uuid('Invalid workflow ID format'),
  timestamp: z.string().datetime('Invalid datetime format'),
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
  context: z.object({
    stepName: z.string().optional(),
    system: z.string().optional(),
    userId: z.string().optional(),
    requestId: z.string().optional(),
    attemptNumber: z.number().int().min(1).optional()
  }),
  remediation: z.object({
    description: z.string(),
    actions: z.array(z.string()),
    retryable: z.boolean(),
    escalationRequired: z.boolean(),
    estimatedResolutionTime: z.string().optional()
  }),
  impact: z.object({
    affectedSystems: z.array(z.string()),
    dataAtRisk: z.boolean(),
    complianceImpact: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']),
    userImpact: z.string().optional()
  }),
  resolution: z.object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED']),
    resolvedAt: z.string().datetime().optional(),
    resolvedBy: z.string().optional(),
    resolution: z.string().optional()
  }).optional(),
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