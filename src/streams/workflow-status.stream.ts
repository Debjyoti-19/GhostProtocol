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

// Simplified schema for workflow status updates
export const workflowStatusUpdateSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  timestamp: z.string(),
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
  metadata: z.record(z.string(), z.unknown()).optional()
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