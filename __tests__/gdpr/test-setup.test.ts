import { describe, it, expect } from 'vitest'
import { GhostProtocolError, WorkflowLockError } from '../../src/gdpr/errors/index.js'
import { CryptoUtils } from '../../src/gdpr/utils/index.js'
import { ghostProtocolConfig } from '../../src/gdpr/config/index.js'

describe('GhostProtocol Infrastructure Setup', () => {
  it('should create custom errors with proper metadata', () => {
    const error = new GhostProtocolError('Test error', 400, 'TEST_ERROR', { test: true })
    
    expect(error.message).toBe('Test error')
    expect(error.status).toBe(400)
    expect(error.code).toBe('TEST_ERROR')
    expect(error.metadata.test).toBe(true)
    expect(error.timestamp).toBeDefined()
  })

  it('should create workflow lock errors with user context', () => {
    const error = new WorkflowLockError('user123', 'workflow456')
    
    expect(error.message).toBe('Concurrent workflow detected for user')
    expect(error.status).toBe(409)
    expect(error.code).toBe('WORKFLOW_LOCK_ERROR')
    expect(error.metadata.userId).toBe('user123')
    expect(error.metadata.existingWorkflowId).toBe('workflow456')
  })

  it('should create SHA-256 hashes correctly', () => {
    const hash1 = CryptoUtils.createHash('test data')
    const hash2 = CryptoUtils.createHash('test data')
    const hash3 = CryptoUtils.createHash('different data')
    
    expect(hash1).toBe(hash2) // Same input should produce same hash
    expect(hash1).not.toBe(hash3) // Different input should produce different hash
    expect(hash1).toMatch(/^[a-f0-9]{64}$/) // Should be 64 character hex string
  })

  it('should create hash chains correctly', () => {
    const genesis = 'genesis'
    const data1 = { event: 'user_created', userId: 'user123' }
    const data2 = { event: 'stripe_deleted', userId: 'user123' }
    
    const hash1 = CryptoUtils.createHashChain(genesis, data1)
    const hash2 = CryptoUtils.createHashChain(hash1, data2)
    
    expect(hash1).toMatch(/^[a-f0-9]{64}$/)
    expect(hash2).toMatch(/^[a-f0-9]{64}$/)
    expect(hash1).not.toBe(hash2)
  })

  it('should verify hash chain integrity', () => {
    const genesis = 'genesis'
    const data = [
      { event: 'workflow_started' },
      { event: 'stripe_deleted' },
      { event: 'db_deleted' }
    ]
    
    const hashes = [genesis]
    let currentHash = genesis
    
    for (const item of data) {
      currentHash = CryptoUtils.createHashChain(currentHash, item)
      hashes.push(currentHash)
    }
    
    expect(CryptoUtils.verifyHashChain(hashes, data)).toBe(true)
    
    // Tamper with data
    const tamperedData = [...data]
    tamperedData[1] = { event: 'tampered_event' }
    
    expect(CryptoUtils.verifyHashChain(hashes, tamperedData)).toBe(false)
  })

  it('should generate unique certificate IDs', () => {
    const id1 = CryptoUtils.generateCertificateId()
    const id2 = CryptoUtils.generateCertificateId()
    
    expect(id1).not.toBe(id2)
    expect(id1).toMatch(/^[A-F0-9]{16}$/) // 16 character uppercase hex
    expect(id2).toMatch(/^[A-F0-9]{16}$/)
  })

  it('should load configuration correctly', () => {
    expect(ghostProtocolConfig.workflow.defaultZombieCheckInterval).toBe(30)
    expect(ghostProtocolConfig.piiAgent.confidenceThresholds.autoDelete).toBe(0.8)
    expect(ghostProtocolConfig.piiAgent.confidenceThresholds.manualReview).toBe(0.5)
    expect(ghostProtocolConfig.audit.hashAlgorithm).toBe('sha256')
    expect(ghostProtocolConfig.certificate.validityPeriod).toBe(365)
  })
})