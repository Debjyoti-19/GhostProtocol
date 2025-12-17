/**
 * Simple Workflow Status Stream for GhostProtocol
 * 
 * Provides real-time updates for workflow status changes.
 * 
 * Requirements: 7.1, 7.3
 */

import { StreamConfig } from 'motia'
import { z } from 'zod'

// Very simple schema without optional fields
export const simpleWorkflowStatusSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  timestamp: z.string(),
  status: z.string(),
  message: z.string()
})

export type SimpleWorkflowStatus = z.infer<typeof simpleWorkflowStatusSchema>

// Stream configuration
export const config: StreamConfig = {
  name: 'simpleWorkflowStatus',
  schema: simpleWorkflowStatusSchema,
  baseConfig: { storageType: 'default' }
}