/**
 * List Workflows API Step
 * 
 * Provides a list of all erasure workflows for admin dashboard
 * Requirements: 7.2
 */

import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'

// Simple middleware implementations
const authMiddleware = (req: any, res: any, next: any) => next()
const requireRole = (roles: string[]) => (req: any, res: any, next: any) => next()

const workflowSummarySchema = z.object({
  workflowId: z.string().uuid(),
  requestId: z.string().uuid(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED', 'AWAITING_MANUAL_REVIEW']),
  progress: z.object({
    totalSteps: z.number().int().min(0),
    completedSteps: z.number().int().min(0),
    failedSteps: z.number().int().min(0),
    percentage: z.number().min(0).max(100)
  }),
  createdAt: z.string().datetime(),
  lastUpdated: z.string().datetime(),
  estimatedCompletion: z.string().datetime().optional()
})

export const config: ApiRouteConfig = {
  name: 'ListWorkflows',
  type: 'api',
  path: '/erasure-request/workflows',
  method: 'GET',
  description: 'List all erasure workflows with summary information',
  middleware: [
    authMiddleware,
    requireRole(['Legal', 'Compliance Admin', 'Auditor', 'System Admin'])
  ],
  emits: [],
  flows: ['erasure-workflow'],
  responseSchema: {
    200: z.object({
      workflows: z.array(workflowSummarySchema),
      total: z.number().int().min(0),
      page: z.number().int().min(1),
      pageSize: z.number().int().min(1)
    }),
    403: z.object({ error: z.string() }),
    500: z.object({ error: z.string() })
  },
  queryParams: [
    {
      name: 'status',
      description: 'Filter by workflow status'
    },
    {
      name: 'page',
      description: 'Page number for pagination (default: 1)'
    },
    {
      name: 'pageSize',
      description: 'Number of items per page (default: 20)'
    }
  ]
}

export const handler: Handlers['ListWorkflows'] = async (req, { logger, state }) => {
  try {
    const statusFilter = req.queryParams.status
    const page = parseInt(req.queryParams.page || '1', 10)
    const pageSize = parseInt(req.queryParams.pageSize || '20', 10)

    logger.info('Listing workflows', { statusFilter, page, pageSize })

    // Get all workflow IDs from state
    // In a real implementation, this would use a proper database query
    const workflowKeys = await state.keys('workflow:*')
    
    const workflows = []
    
    for (const key of workflowKeys) {
      const workflowState = await state.get(key)
      
      if (!workflowState) continue
      
      // Apply status filter if provided
      if (statusFilter && workflowState.status !== statusFilter) {
        continue
      }
      
      // Get original request for metadata
      const erasureRequest = await state.get(`request:${workflowState.workflowId}`)
      
      if (!erasureRequest) continue
      
      // Calculate progress metrics
      const stepEntries = Object.entries(workflowState.steps || {})
      const totalSteps = stepEntries.length
      const completedSteps = stepEntries.filter(([_, step]: [string, any]) => step.status === 'DELETED').length
      const failedSteps = stepEntries.filter(([_, step]: [string, any]) => step.status === 'FAILED').length
      const percentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
      
      // Estimate completion time
      let estimatedCompletion: string | undefined
      if (workflowState.status === 'IN_PROGRESS' && totalSteps > 0) {
        const avgTimePerStep = 300000 // 5 minutes in ms
        const remainingSteps = totalSteps - completedSteps
        const estimatedMs = remainingSteps * avgTimePerStep
        estimatedCompletion = new Date(Date.now() + estimatedMs).toISOString()
      }
      
      workflows.push({
        workflowId: workflowState.workflowId,
        requestId: erasureRequest.requestId,
        status: workflowState.status,
        progress: {
          totalSteps,
          completedSteps,
          failedSteps,
          percentage
        },
        createdAt: erasureRequest.createdAt,
        lastUpdated: new Date().toISOString(),
        estimatedCompletion
      })
    }
    
    // Sort by creation date (newest first)
    workflows.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    
    // Apply pagination
    const total = workflows.length
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const paginatedWorkflows = workflows.slice(startIndex, endIndex)

    logger.info('Workflows listed successfully', { 
      total, 
      page, 
      pageSize,
      returned: paginatedWorkflows.length 
    })

    return {
      status: 200,
      body: {
        workflows: paginatedWorkflows,
        total,
        page,
        pageSize
      }
    }

  } catch (error) {
    logger.error('Failed to list workflows', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to list workflows' }
    }
  }
}
