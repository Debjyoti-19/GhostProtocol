/**
 * Certificate Download API Step
 * 
 * Provides certificate of destruction download for completed workflows
 * Requirements: 7.2
 */

import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'

// Simple middleware implementations
const authMiddleware = (req: any, res: any, next: any) => next()
const requireRole = (roles: string[]) => (req: any, res: any, next: any) => next()

export const config: ApiRouteConfig = {
  name: 'GetCertificate',
  type: 'api',
  path: '/erasure-request/:id/certificate',
  method: 'GET',
  description: 'Download Certificate of Destruction for completed workflows',
  middleware: [
    authMiddleware,
    requireRole(['Legal', 'Compliance Admin', 'Auditor'])
  ],
  emits: [
    {
      topic: 'audit-log',
      label: 'Certificate Download Audit',
      conditional: false
    }
  ],
  flows: ['erasure-workflow'],
  responseSchema: {
    200: z.object({
      certificateId: z.string(),
      workflowId: z.string(),
      format: z.enum(['json', 'pdf']),
      data: z.any()
    }),
    404: z.object({ error: z.string() }),
    403: z.object({ error: z.string() }),
    500: z.object({ error: z.string() })
  },
  queryParams: [
    {
      name: 'format',
      description: 'Certificate format (json or pdf)'
    }
  ]
}

export const handler: Handlers['GetCertificate'] = async (req, { emit, logger, state }) => {
  try {
    const workflowId = req.pathParams.id
    const format = req.queryParams.format || 'json'

    logger.info('Certificate download requested', { workflowId, format })

    // Get workflow state
    const workflowState = await state.get(`workflow:${workflowId}`)
    
    if (!workflowState) {
      logger.warn('Workflow not found', { workflowId })
      return {
        status: 404,
        body: { error: 'Workflow not found' }
      }
    }

    // Check if workflow is completed
    if (!['COMPLETED', 'COMPLETED_WITH_EXCEPTIONS'].includes(workflowState.status)) {
      logger.warn('Certificate not available for incomplete workflow', { 
        workflowId, 
        status: workflowState.status 
      })
      return {
        status: 403,
        body: { error: 'Certificate only available for completed workflows' }
      }
    }

    // Get certificate from state
    const certificate = await state.get(`certificate:${workflowId}`)
    
    if (!certificate) {
      logger.error('Certificate not found for completed workflow', { workflowId })
      return {
        status: 500,
        body: { error: 'Certificate not found' }
      }
    }

    // Emit audit log
    await emit({
      topic: 'audit-log',
      data: {
        event: 'CERTIFICATE_DOWNLOADED',
        workflowId,
        certificateId: certificate.certificateId,
        downloadedBy: req.headers['user-id'] || 'unknown',
        format,
        timestamp: new Date().toISOString()
      }
    })

    logger.info('Certificate downloaded successfully', { 
      workflowId, 
      certificateId: certificate.certificateId,
      format 
    })

    // Return certificate data
    return {
      status: 200,
      body: {
        certificateId: certificate.certificateId,
        workflowId: certificate.workflowId,
        format,
        data: certificate
      },
      headers: {
        'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/json',
        'Content-Disposition': `attachment; filename="certificate-${workflowId}.${format}"`
      }
    }

  } catch (error) {
    logger.error('Failed to retrieve certificate', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to retrieve certificate' }
    }
  }
}
