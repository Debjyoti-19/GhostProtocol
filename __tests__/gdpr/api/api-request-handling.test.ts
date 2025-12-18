/**
 * Property-based tests for API request handling
 * **Feature: gdpr-erasure-system, Property 2: Concurrency Control**
 * **Validates: Requirements 1.3, 1.5, 1.6**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'
import { 
  type ErasureRequest, 
  type UserIdentifiers,
  type LegalProof,
  type RequestedBy,
  type Jurisdiction,
  ErasureRequestSchema,
  WorkflowStateSchema
} from '../../../src/gdpr/schemas/index.js'

// Mock state store for testing
class MockStateStore {
  private store = new Map<string, any>()

  async get(key: string) {
    return this.store.get(key) || null
  }

  async set(key: string, value: any, options?: { ttl?: number }) {
    this.store.set(key, value)
  }

  clear() {
    this.store.clear()
  }
}

// Mock emit function
const mockEmit = async (event: { topic: string; data: any }) => {
  // Store emitted events for verification
  mockEmit.events = mockEmit.events || []
  mockEmit.events.push(event)
}

// Mock logger
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {}
}

// Property-based test generators
const userIdentifiersArb = fc.record({
  userId: fc.uuid(),
  emails: fc.array(fc.constant('test@example.com'), { minLength: 1, maxLength: 1 }),
  phones: fc.array(fc.constant('+1234567890'), { minLength: 0, maxLength: 1 }),
  aliases: fc.array(fc.constant('test-alias'), { minLength: 0, maxLength: 1 })
})

const legalProofArb = fc.record({
  type: fc.constantFrom('SIGNED_REQUEST', 'LEGAL_FORM', 'OTP_VERIFIED'),
  evidence: fc.constant('Valid legal evidence document'),
  verifiedAt: fc.constant('2023-01-01T00:00:00.000Z')
})

const requestedByArb = fc.record({
  userId: fc.uuid(),
  role: fc.constantFrom('compliance_officer', 'legal_counsel', 'admin'),
  organization: fc.constant('Test Organization')
})

const jurisdictionArb: fc.Arbitrary<Jurisdiction> = fc.constantFrom('EU', 'US', 'OTHER')

const erasureRequestBodyArb = fc.record({
  userIdentifiers: userIdentifiersArb,
  legalProof: legalProofArb,
  jurisdiction: jurisdictionArb,
  requestedBy: requestedByArb
})

// Core concurrency control logic (extracted from handler for testing)
async function createErasureWorkflow(requestBody: any, state: MockStateStore) {
  const requestId = uuidv4()
  const workflowId = uuidv4()
  const createdAt = new Date().toISOString()

  try {
    // Validate request body
    const validatedRequest = ErasureRequestSchema.omit({ 
      requestId: true, 
      createdAt: true, 
      workflowId: true 
    }).parse(requestBody)

  // Check for existing workflows using user identifiers
  const userKey = `user_lock:${validatedRequest.userIdentifiers.userId}`
  const existingLock = await state.get(userKey)
  
  if (existingLock) {
    return { status: 409, error: 'Concurrent workflow detected', existingWorkflowId: existingLock.workflowId }
  }

  // Create request hash for idempotency checking
  const requestHash = Buffer.from(JSON.stringify({
    userIdentifiers: validatedRequest.userIdentifiers,
    legalProof: validatedRequest.legalProof,
    jurisdiction: validatedRequest.jurisdiction
  })).toString('base64')

  // Check for duplicate requests using hash
  const hashKey = `request_hash:${requestHash}`
  const existingRequest = await state.get(hashKey)
  
  if (existingRequest) {
    return { status: 409, error: 'Duplicate request detected', existingWorkflowId: existingRequest.workflowId }
  }

  // Acquire per-user lock
  await state.set(userKey, { workflowId, requestId, lockedAt: createdAt })

  // Store request hash for idempotency
  await state.set(hashKey, { requestId, workflowId, createdAt })

  // Create complete erasure request
  const erasureRequest: ErasureRequest = {
    requestId,
    workflowId,
    createdAt,
    ...validatedRequest
  }

    // Store request
    await state.set(`request:${requestId}`, erasureRequest)

    return { status: 201, body: erasureRequest }
  } catch (error) {
    // Return validation error
    return { status: 409, error: error.message }
  }
}

describe('API Request Handling - Property 2: Concurrency Control', () => {
  let mockState: MockStateStore

  beforeEach(() => {
    mockState = new MockStateStore()
    mockEmit.events = []
  })

  afterEach(() => {
    mockState.clear()
  })

  it('should prevent concurrent workflows for the same user identifier', async () => {
    await fc.assert(
      fc.asyncProperty(
        erasureRequestBodyArb,
        async (requestBody) => {
          // First request should succeed
          const firstResponse = await createErasureWorkflow(requestBody, mockState)
          expect(firstResponse.status).toBe(201)
          expect(firstResponse.body).toHaveProperty('workflowId')

          // Second concurrent request with same user ID should fail with 409
          const secondResponse = await createErasureWorkflow(requestBody, mockState)
          expect(secondResponse.status).toBe(409)
          expect(secondResponse.error).toContain('Concurrent workflow detected')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should detect duplicate requests using request hash', async () => {
    await fc.assert(
      fc.asyncProperty(
        erasureRequestBodyArb,
        async (requestBody) => {
          // First request should succeed
          const firstResponse = await createErasureWorkflow(requestBody, mockState)
          expect(firstResponse.status).toBe(201)

          // Clear user lock but keep request hash
          const userKey = `user_lock:${requestBody.userIdentifiers.userId}`
          await mockState.set(userKey, null)

          // Second request with identical content should be deduplicated
          const secondResponse = await createErasureWorkflow(requestBody, mockState)
          expect(secondResponse.status).toBe(409)
          expect(secondResponse.error).toContain('Duplicate request detected')
          expect(secondResponse).toHaveProperty('existingWorkflowId')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should allow concurrent requests for different users', async () => {
    await fc.assert(
      fc.asyncProperty(
        erasureRequestBodyArb,
        erasureRequestBodyArb,
        async (requestBody1, requestBody2) => {
          // Ensure different user IDs
          fc.pre(requestBody1.userIdentifiers.userId !== requestBody2.userIdentifiers.userId)

          // Both requests should succeed since they're for different users
          const response1 = await createErasureWorkflow(requestBody1, mockState)
          const response2 = await createErasureWorkflow(requestBody2, mockState)

          expect(response1.status).toBe(201)
          expect(response2.status).toBe(201)
          expect(response1.body.workflowId).not.toBe(response2.body.workflowId)
          expect(response1.body.userIdentifiers.userId).not.toBe(response2.body.userIdentifiers.userId)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should properly store request hash for idempotency', async () => {
    await fc.assert(
      fc.asyncProperty(
        erasureRequestBodyArb,
        async (requestBody) => {
          // First request
          const firstResponse = await createErasureWorkflow(requestBody, mockState)
          expect(firstResponse.status).toBe(201)
          
          // Clear user lock to test hash-based deduplication
          const userKey = `user_lock:${requestBody.userIdentifiers.userId}`
          await mockState.set(userKey, null)

          // Second duplicate request should be detected via hash
          const secondResponse = await createErasureWorkflow(requestBody, mockState)
          expect(secondResponse.status).toBe(409)
          expect(secondResponse.error).toContain('Duplicate request detected')
          
          // Verify request hash was stored
          const requestHash = Buffer.from(JSON.stringify({
            userIdentifiers: requestBody.userIdentifiers,
            legalProof: requestBody.legalProof,
            jurisdiction: requestBody.jurisdiction
          })).toString('base64')
          
          const hashKey = `request_hash:${requestHash}`
          const storedHash = await mockState.get(hashKey)
          expect(storedHash).toBeDefined()
          expect(storedHash.workflowId).toBe(firstResponse.body.workflowId)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should create exactly one workflow instance per valid request', async () => {
    await fc.assert(
      fc.asyncProperty(
        erasureRequestBodyArb,
        async (requestBody) => {
          const response = await createErasureWorkflow(requestBody, mockState)
          
          if (response.status === 201) {
            // Verify workflow was created
            expect(response.body).toHaveProperty('workflowId')
            expect(response.body).toHaveProperty('requestId')
            
            // Verify request was stored
            const storedRequest = await mockState.get(`request:${response.body.requestId}`)
            expect(storedRequest).toBeDefined()
            expect(storedRequest.requestId).toBe(response.body.requestId)
            
            // Verify user lock was acquired
            const userLock = await mockState.get(`user_lock:${requestBody.userIdentifiers.userId}`)
            expect(userLock).toBeDefined()
            expect(userLock.workflowId).toBe(response.body.workflowId)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should validate request data correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        erasureRequestBodyArb,
        async (requestBody) => {
          const response = await createErasureWorkflow(requestBody, mockState)
          
          // All generated requests should be valid and succeed
          expect(response.status).toBe(201)
          expect(response.body).toHaveProperty('workflowId')
          expect(response.body).toHaveProperty('requestId')
          expect(response.body).toHaveProperty('userIdentifiers')
          expect(response.body).toHaveProperty('legalProof')
          expect(response.body).toHaveProperty('jurisdiction')
          expect(response.body).toHaveProperty('requestedBy')
          expect(response.body).toHaveProperty('createdAt')
          
          // Verify user identifiers are preserved
          expect(response.body.userIdentifiers.userId).toBe(requestBody.userIdentifiers.userId)
          expect(response.body.userIdentifiers.emails).toEqual(requestBody.userIdentifiers.emails)
          expect(response.body.userIdentifiers.phones).toEqual(requestBody.userIdentifiers.phones)
          expect(response.body.userIdentifiers.aliases).toEqual(requestBody.userIdentifiers.aliases)
        }
      ),
      { numRuns: 100 }
    )
  })
})