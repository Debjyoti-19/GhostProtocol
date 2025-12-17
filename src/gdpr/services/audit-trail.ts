/**
 * Immutable audit trail service for GhostProtocol
 * Provides tamper-evident logging with SHA-256 hash chains
 */

import { CryptoUtils } from '../utils/crypto.js'

export interface AuditEvent {
  eventId: string
  workflowId: string
  eventType: 'WORKFLOW_CREATED' | 'STEP_STARTED' | 'STEP_COMPLETED' | 'STEP_FAILED' | 'STATE_UPDATED' | 'CERTIFICATE_GENERATED'
  timestamp: string
  data: any
  metadata?: {
    stepName?: string
    system?: string
    userId?: string
    [key: string]: any
  }
}

export interface AuditEntry {
  event: AuditEvent
  hash: string
  previousHash: string
}

export interface AuditTrailState {
  workflowId: string
  entries: AuditEntry[]
  hashChain: string[]
  genesisHash: string
  lastUpdated: string
}

export class AuditTrail {
  private state: AuditTrailState

  constructor(workflowId: string, genesisHash?: string) {
    const genesis = genesisHash || CryptoUtils.createHash(`genesis:${workflowId}:${Date.now()}`)
    
    this.state = {
      workflowId,
      entries: [],
      hashChain: [genesis],
      genesisHash: genesis,
      lastUpdated: new Date().toISOString()
    }
  }

  /**
   * Appends a new event to the audit trail
   * Creates hash chain linking to previous entry
   */
  appendEvent(event: AuditEvent): AuditEntry {
    if (event.workflowId !== this.state.workflowId) {
      throw new Error(`Event workflow ID ${event.workflowId} does not match audit trail workflow ID ${this.state.workflowId}`)
    }

    const previousHash = this.state.hashChain[this.state.hashChain.length - 1]
    const eventHash = CryptoUtils.createHashChain(previousHash, event)
    
    const entry: AuditEntry = {
      event,
      hash: eventHash,
      previousHash
    }

    // Append to immutable structures
    this.state = {
      ...this.state,
      entries: [...this.state.entries, entry],
      hashChain: [...this.state.hashChain, eventHash],
      lastUpdated: new Date().toISOString()
    }

    return entry
  }

  /**
   * Verifies the integrity of the entire hash chain
   * Returns true if no tampering detected
   */
  verifyIntegrity(): boolean {
    if (this.state.entries.length === 0) {
      return this.state.hashChain.length === 1 && this.state.hashChain[0] === this.state.genesisHash
    }

    // Verify genesis hash
    if (this.state.hashChain[0] !== this.state.genesisHash) {
      return false
    }

    // Verify each entry's hash chain
    for (let i = 0; i < this.state.entries.length; i++) {
      const entry = this.state.entries[i]
      const expectedHash = CryptoUtils.createHashChain(entry.previousHash, entry.event)
      
      if (entry.hash !== expectedHash) {
        return false
      }

      if (this.state.hashChain[i + 1] !== entry.hash) {
        return false
      }
    }

    return true
  }

  /**
   * Gets the current hash root (latest hash in chain)
   */
  getHashRoot(): string {
    return this.state.hashChain[this.state.hashChain.length - 1]
  }

  /**
   * Gets all audit entries (immutable copy)
   */
  getEntries(): AuditEntry[] {
    return this.state.entries.map(entry => ({
      ...entry,
      event: {
        ...entry.event,
        data: { ...entry.event.data },
        metadata: entry.event.metadata ? { ...entry.event.metadata } : undefined
      }
    }))
  }

  /**
   * Gets the complete hash chain (immutable copy)
   */
  getHashChain(): string[] {
    return [...this.state.hashChain]
  }

  /**
   * Gets audit trail state (immutable copy)
   */
  getState(): AuditTrailState {
    return {
      ...this.state,
      entries: [...this.state.entries],
      hashChain: [...this.state.hashChain]
    }
  }

  /**
   * Creates audit trail from existing state (for persistence/restoration)
   */
  static fromState(state: AuditTrailState): AuditTrail {
    const trail = new AuditTrail(state.workflowId, state.genesisHash)
    trail.state = {
      ...state,
      entries: [...state.entries],
      hashChain: [...state.hashChain]
    }
    return trail
  }

  /**
   * Detects tampering by comparing expected vs actual hashes
   */
  detectTampering(): { tampered: boolean; corruptedIndex?: number; details?: string } {
    if (!this.verifyIntegrity()) {
      // Find the first corrupted entry
      for (let i = 0; i < this.state.entries.length; i++) {
        const entry = this.state.entries[i]
        const expectedHash = CryptoUtils.createHashChain(entry.previousHash, entry.event)
        
        if (entry.hash !== expectedHash) {
          return {
            tampered: true,
            corruptedIndex: i,
            details: `Hash mismatch at entry ${i}: expected ${expectedHash}, got ${entry.hash}`
          }
        }
      }

      return {
        tampered: true,
        details: 'Hash chain integrity check failed'
      }
    }

    return { tampered: false }
  }

  /**
   * Gets audit events for a specific step
   */
  getStepEvents(stepName: string): AuditEntry[] {
    return this.state.entries.filter(entry => 
      entry.event.metadata?.stepName === stepName
    )
  }

  /**
   * Gets audit events by type
   */
  getEventsByType(eventType: AuditEvent['eventType']): AuditEntry[] {
    return this.state.entries.filter(entry => 
      entry.event.eventType === eventType
    )
  }

  /**
   * Creates a timestamped audit event
   */
  static createEvent(
    workflowId: string,
    eventType: AuditEvent['eventType'],
    data: any,
    metadata?: AuditEvent['metadata']
  ): AuditEvent {
    return {
      eventId: CryptoUtils.createHash(`${workflowId}:${eventType}:${Date.now()}:${Math.random()}`).substring(0, 16),
      workflowId,
      eventType,
      timestamp: new Date().toISOString(),
      data,
      metadata
    }
  }
}