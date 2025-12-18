/**
 * Audit Logger Event Step
 * 
 * Centralized audit logging for all workflow events
 * Requirements: 6.1, 6.2, 6.5
 */

import { z } from 'zod'

const AuditLogInputSchema = z.object({
  event: z.string(),
  workflowId: z.string().uuid().optional(),
  timestamp: z.string().datetime().optional(),
  data: z.any().optional()
})

export const config = {
  name: 'AuditLogger',
  type: 'event' as const,
  description: 'Centralized audit logging for all workflow events',
  flows: ['erasure-workflow'],
  subscribes: ['audit-log'],
  emits: [],
  input: AuditLogInputSchema
}

export async function handler(data: any, { logger, state }: any): Promise<void> {
  const auditEntry = AuditLogInputSchema.parse(data)
  const timestamp = auditEntry.timestamp || new Date().toISOString()

  logger.info('Audit log entry', { 
    event: auditEntry.event,
    workflowId: auditEntry.workflowId,
    timestamp 
  })

  // Store audit log in state
  if (auditEntry.workflowId) {
    const auditKey = `audit:${auditEntry.workflowId}:${timestamp}`
    await state.set('audit_logs', auditKey, {
      ...auditEntry,
      timestamp
    })
  }
}
