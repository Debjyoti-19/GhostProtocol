/**
 * Workflow Status Stream for GhostProtocol
 * 
 * Provides real-time updates for workflow status changes, step progress,
 * and completion notifications for compliance teams.
 * 
 * Requirements: 7.1, 7.3, 7.4, 7.5
 */

import { StreamConfig } from 'motia'
import { z } from 'zod'

// Schema for workflow status updates
export const workflowStatusUpdateSchema = z.object({
  id: z.string().uuid('Invalid update ID format'),
  workflowId: z.string().uuid('Invalid workflow ID format'),
  timestamp: z.string().datetime('Invalid datetime format'),
  type: z.enum(['STATUS_CHANGE', 'STEP_UPDATE', 'PROGRESS_UPDATE', 'ERROR', 'COMPLETION']),
  status: z.enum([
    'IN_PROGRESS',
    'COMPLETED', 
    'COMPLETED_WITH_EXCEPTIONS',
    'FAILED',
    'AWAITING_MANUAL_REVIEW'
  ]),
  stepName: z.string().optional(),
  stepStatus: z.enum([
    'NOT_STARTED',
    'IN_PROGRESS',
    'DELETED',
    'FAILED',
    'LEGAL_HOLD'
  ]).optional(),
  progress: z.object({
    totalSteps: z.number().int().min(0),
    completedSteps: z.number().int().min(0),
    failedSteps: z.number().int().min(0),
    percentage: z.number().min(0).max(100)
  }).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    stepName: z.string().optional(),
    remediation: z.string().optional(),
    retryable: z.boolean()
  }).optional(),
  completion: z.object({
    certificateId: z.string().uuid().optional(),
    systemsDeleted: z.number().int().min(0),
    systemsFailed: z.number().int().min(0),
    legalHolds: z.number().int().min(0),
    completedAt: z.string().datetime()
  }).optional(),
  metadata: z.record(z.any()).optional()
})

export type WorkflowStatusUpdate = z.infer<typeof workflowStatusUpdateSchema>

// Stream configuration with authentication
export const config: StreamConfig = {
  name: 'workflowStatus',
  schema: workflowStatusUpdateSchema,
  baseConfig: { storageType: 'default' },
  
  // Authentication for secure monitoring access
  canAccess: async (subscription, authContext) => {
    // Check if user has appropriate role for monitoring
    if (!authContext?.user) {
      return false
    }

    const allowedRoles = ['Legal', 'Compliance Admin', 'Auditor', 'System Admin']
    return allowedRoles.includes(authContext.user.role)
  }
}