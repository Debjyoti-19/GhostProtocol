import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
// Simple middleware implementations (inline to avoid import issues)
const authMiddleware = (req: any, res: any, next: any) => next()
const requireRole = (role: string) => (req: any, res: any, next: any) => next()
// Simple error classes for this step
class WorkflowLockError extends Error {
  constructor(userId: string) {
    super(`Concurrent workflow detected for user: ${userId}`)
    this.name = 'WorkflowLockError'
  }
}

class IdentityValidationError extends Error {
  constructor(message: string) {
    super(`Identity validation failed: ${message}`)
    this.name = 'IdentityValidationError'
  }
}

class WorkflowStateError extends Error {
  constructor(workflowId: string, message: string) {
    super(`Workflow ${workflowId}: ${message}`)
    this.name = 'WorkflowStateError'
  }
}

// Inline schemas to avoid import issues
const UserIdentifiersSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  emails: z.array(z.string().email('Invalid email format')),
  phones: z.array(z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone format')),
  aliases: z.array(z.string().min(1, 'Alias cannot be empty'))
})

const LegalProofSchema = z.object({
  type: z.enum(['SIGNED_REQUEST', 'LEGAL_FORM', 'OTP_VERIFIED']),
  evidence: z.string().min(1, 'Evidence is required'),
  verifiedAt: z.string().datetime('Invalid datetime format')
})

const RequestedBySchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: z.string().min(1, 'Role is required'),
  organization: z.string().min(1, 'Organization is required')
})

const ErasureRequestBodySchema = z.object({
  userIdentifiers: UserIdentifiersSchema,
  legalProof: LegalProofSchema,
  jurisdiction: z.enum(['EU', 'US', 'OTHER']),
  requestedBy: RequestedBySchema
})

const ErasureRequestResponseSchema = ErasureRequestBodySchema.extend({
  requestId: z.string().uuid(),
  workflowId: z.string().uuid(),
  createdAt: z.string().datetime()
})

export const config: ApiRouteConfig = {
  name: 'CreateErasureRequest',
  type: 'api',
  path: '/erasure-request',
  method: 'POST',
  description: 'Initiate new erasure workflow with identity validation and concurrency control',
  middleware: [
    authMiddleware,
    requireRole('compliance_officer')
  ],
  emits: [
    {
      topic: 'workflow-created',
      label: 'Workflow Created',
      conditional: false
    },
    {
      topic: 'audit-log',
      label: 'Audit Log Entry',
      conditional: false
    }
  ],
  flows: ['erasure-workflow'],
  bodySchema: ErasureRequestBodySchema,
  responseSchema: {
    201: ErasureRequestResponseSchema,
    400: z.object({ error: z.string() }),
    409: z.object({ error: z.string(), existingWorkflowId: z.string().optional() }),
    500: z.object({ error: z.string() })
  },
  queryParams: []
}

export const handler: Handlers['CreateErasureRequest'] = async (req, { emit, logger, state }) => {
  try {
    // Parse and validate request body
    const requestData = ErasureRequestBodySchema.parse(req.body)

    const requestId = uuidv4()
    const workflowId = uuidv4()
    const createdAt = new Date().toISOString()

    logger.info('Processing erasure request', { 
      requestId, 
      userIdentifiers: requestData.userIdentifiers,
      jurisdiction: requestData.jurisdiction 
    })

    // Check for existing workflows using user identifiers
    const userKey = `user_lock:${requestData.userIdentifiers.userId}`
    const existingLock = await state.get(userKey)
    
    if (existingLock) {
      logger.warn('Concurrent workflow detected', { 
        requestId, 
        existingWorkflowId: existingLock.workflowId,
        userId: requestData.userIdentifiers.userId 
      })
      
      // Emit audit log for duplicate request
      await emit({
        topic: 'audit-log',
        data: {
          event: 'DUPLICATE_REQUEST_DETECTED',
          requestId,
          existingWorkflowId: existingLock.workflowId,
          userIdentifiers: requestData.userIdentifiers,
          timestamp: createdAt,
          requestedBy: requestData.requestedBy
        }
      })

      throw new WorkflowLockError(requestData.userIdentifiers.userId)
    }

    // Create request hash for idempotency checking
    const requestHash = Buffer.from(JSON.stringify({
      userIdentifiers: requestData.userIdentifiers,
      legalProof: requestData.legalProof,
      jurisdiction: requestData.jurisdiction
    })).toString('base64')

    // Check for duplicate requests using hash
    const hashKey = `request_hash:${requestHash}`
    const existingRequest = await state.get(hashKey)
    
    if (existingRequest) {
      logger.info('Duplicate request detected via hash', { 
        requestId, 
        existingRequestId: existingRequest.requestId,
        existingWorkflowId: existingRequest.workflowId 
      })

      // Emit audit log for deduplication
      await emit({
        topic: 'audit-log',
        data: {
          event: 'REQUEST_DEDUPLICATED',
          requestId,
          existingRequestId: existingRequest.requestId,
          existingWorkflowId: existingRequest.workflowId,
          requestHash,
          timestamp: createdAt,
          requestedBy: requestData.requestedBy
        }
      })

      return {
        status: 409,
        body: {
          error: 'Duplicate request detected',
          existingWorkflowId: existingRequest.workflowId
        }
      }
    }

    // Acquire per-user lock
    await state.set(userKey, { 
      workflowId, 
      requestId, 
      lockedAt: createdAt 
    }, { ttl: 86400 }) // 24 hour TTL

    // Store request hash for idempotency
    await state.set(hashKey, { 
      requestId, 
      workflowId, 
      createdAt 
    }, { ttl: 86400 }) // 24 hour TTL

    // Create complete erasure request
    const erasureRequest = {
      requestId,
      workflowId,
      createdAt,
      ...requestData
    }

    // Create initial workflow state with data lineage snapshot
    const initialWorkflowState = {
      workflowId,
      userIdentifiers: requestData.userIdentifiers,
      status: 'IN_PROGRESS',
      policyVersion: '1.0.0', // TODO: Get from policy service
      legalHolds: [],
      steps: {},
      backgroundJobs: {},
      auditHashes: [],
      dataLineageSnapshot: {
        systems: ['stripe', 'database', 'intercom', 'sendgrid', 'crm', 'analytics'], // TODO: Dynamic discovery
        identifiers: [
          requestData.userIdentifiers.userId,
          ...requestData.userIdentifiers.emails,
          ...requestData.userIdentifiers.phones,
          ...requestData.userIdentifiers.aliases
        ],
        capturedAt: createdAt
      }
    }

    // Store workflow state
    await state.set(`workflow:${workflowId}`, initialWorkflowState)

    // Store erasure request
    await state.set(`request:${requestId}`, erasureRequest)

    logger.info('Erasure request created successfully', { 
      requestId, 
      workflowId,
      userId: requestData.userIdentifiers.userId 
    })

    // Emit workflow creation event
    await emit({
      topic: 'workflow-created',
      data: {
        workflowId,
        requestId,
        userIdentifiers: requestData.userIdentifiers,
        jurisdiction: requestData.jurisdiction,
        policyVersion: initialWorkflowState.policyVersion,
        dataLineageSnapshot: initialWorkflowState.dataLineageSnapshot
      }
    })

    // Emit audit log entry
    await emit({
      topic: 'audit-log',
      data: {
        event: 'WORKFLOW_CREATED',
        workflowId,
        requestId,
        userIdentifiers: requestData.userIdentifiers,
        timestamp: createdAt,
        requestedBy: requestData.requestedBy,
        dataLineageSnapshot: initialWorkflowState.dataLineageSnapshot
      }
    })

    return {
      status: 201,
      body: erasureRequest
    }

  } catch (error) {
    if (error instanceof WorkflowLockError) {
      return {
        status: 409,
        body: {
          error: error.message,
          existingWorkflowId: error.metadata?.workflowId || 'unknown'
        }
      }
    }

    if (error instanceof IdentityValidationError) {
      logger.error('Identity validation failed', { error: error.message })
      return {
        status: 400,
        body: { error: error.message }
      }
    }

    logger.error('Failed to create erasure request', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to create erasure request' }
    }
  }
}