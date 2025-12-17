/**
 * PII Detection Agent Service
 * Implements AI-powered detection of personally identifiable information in unstructured data
 * with pre-filtering, confidence scoring, and audit logging
 */

import { v4 as uuidv4 } from 'uuid'
import { PIIFinding, PIIType, PIIProvenance } from '../types/index.js'
// Configuration constants (inline to avoid import issues)
const ghostProtocolConfig = {
  piiAgent: {
    confidenceThresholds: {
      autoDelete: 0.8,
      manualReview: 0.5
    },
    maxChunkSize: 4000,
    preFilterPatterns: {
      email: /\b[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}\b/g,
      phone: /\b(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})\b/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g
    }
  }
}

export interface PIIAgentInput {
  content: string
  system: string
  location: string
  provenance?: Partial<PIIProvenance>
}

export interface PIIAgentOutput {
  findings: PIIFinding[]
  processedAt: string
  contentHash: string // For audit trail without storing raw content
  metadata: {
    preFilterMatches: number
    chunkCount: number
    totalConfidenceScore: number
  }
}

export interface PIIAgentAuditEntry {
  agentId: string
  inputHash: string // Hash of input content for reference
  inputMetadata: {
    system: string
    location: string
    contentLength: number
    provenance?: Partial<PIIProvenance>
  }
  outputSummary: {
    findingsCount: number
    highConfidenceCount: number
    mediumConfidenceCount: number
    lowConfidenceCount: number
  }
  processedAt: string
  processingTimeMs: number
}

export class PIIAgent {
  private readonly config = ghostProtocolConfig.piiAgent
  private readonly auditLog: PIIAgentAuditEntry[] = []

  /**
   * Pre-filter content using regex patterns to identify potential PII
   * This reduces the amount of content sent to the AI model
   */
  private preFilterContent(content: string): Array<{ type: PIIType; matches: RegExpMatchArray[] }> {
    const results: Array<{ type: PIIType; matches: RegExpMatchArray[] }> = []
    
    // Email detection
    const emailMatches = Array.from(content.matchAll(this.config.preFilterPatterns.email))
    if (emailMatches.length > 0) {
      results.push({ type: 'email', matches: emailMatches })
    }

    // Phone detection
    const phoneMatches = Array.from(content.matchAll(this.config.preFilterPatterns.phone))
    if (phoneMatches.length > 0) {
      results.push({ type: 'phone', matches: phoneMatches })
    }

    // Name detection (simple pattern for common name formats)
    const namePattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g
    const nameMatches = Array.from(content.matchAll(namePattern))
    if (nameMatches.length > 0) {
      results.push({ type: 'name', matches: nameMatches })
    }

    return results
  }

  /**
   * Chunk content into manageable pieces for processing
   */
  private chunkContent(content: string): string[] {
    const chunks: string[] = []
    const maxChunkSize = this.config.maxChunkSize

    // Always return at least one chunk, even for empty content
    if (content.length === 0) {
      return [content]
    }

    for (let i = 0; i < content.length; i += maxChunkSize) {
      chunks.push(content.slice(i, i + maxChunkSize))
    }

    return chunks
  }

  /**
   * Simulate AI model inference for PII detection
   * In a real implementation, this would call an actual AI model
   */
  private async simulateAIInference(chunk: string, preFilterResults: Array<{ type: PIIType; matches: RegExpMatchArray[] }>): Promise<PIIFinding[]> {
    const findings: PIIFinding[] = []

    // For each pre-filtered match, assign confidence scores
    for (const result of preFilterResults) {
      for (const match of result.matches) {
        if (match.index !== undefined && match[0]) {
          // Simulate confidence scoring based on context and pattern strength
          let confidence = 0.6 // Base confidence
          
          // Boost confidence for well-formed patterns
          if (result.type === 'email' && match[0].includes('@')) {
            confidence = Math.min(0.95, confidence + 0.3)
          }
          if (result.type === 'phone' && /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})/.test(match[0])) {
            confidence = Math.min(0.9, confidence + 0.25)
          }
          if (result.type === 'name' && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(match[0])) {
            confidence = Math.min(0.85, confidence + 0.2)
          }

          // Add some randomness to simulate real AI uncertainty
          confidence += (Math.random() - 0.5) * 0.1
          confidence = Math.max(0.1, Math.min(0.99, confidence))

          findings.push({
            matchId: uuidv4(),
            system: '', // Will be set by caller
            location: '', // Will be set by caller
            piiType: result.type,
            confidence: Math.round(confidence * 100) / 100, // Round to 2 decimal places
            snippet: match[0],
            provenance: {
              timestamp: new Date().toISOString()
            }
          })
        }
      }
    }

    return findings
  }

  /**
   * Process content to detect PII with structured output
   */
  async detectPII(input: PIIAgentInput): Promise<PIIAgentOutput> {
    const startTime = Date.now()
    const contentHash = this.hashContent(input.content)
    
    // Pre-filter content
    const preFilterResults = this.preFilterContent(input.content)
    const preFilterMatches = preFilterResults.reduce((sum, result) => sum + result.matches.length, 0)

    // Chunk content for processing
    const chunks = this.chunkContent(input.content)
    
    // Process each chunk
    const allFindings: PIIFinding[] = []
    for (const chunk of chunks) {
      const chunkPreFilter = this.preFilterContent(chunk)
      const chunkFindings = await this.simulateAIInference(chunk, chunkPreFilter)
      
      // Set system and location for findings
      chunkFindings.forEach(finding => {
        finding.system = input.system
        finding.location = input.location
        if (input.provenance) {
          finding.provenance = { ...finding.provenance, ...input.provenance }
        }
      })
      
      allFindings.push(...chunkFindings)
    }

    // Calculate total confidence score
    const totalConfidenceScore = allFindings.reduce((sum, finding) => sum + finding.confidence, 0)

    const output: PIIAgentOutput = {
      findings: allFindings,
      processedAt: new Date().toISOString(),
      contentHash,
      metadata: {
        preFilterMatches,
        chunkCount: chunks.length,
        totalConfidenceScore
      }
    }

    // Create audit entry
    const auditEntry: PIIAgentAuditEntry = {
      agentId: uuidv4(),
      inputHash: contentHash,
      inputMetadata: {
        system: input.system,
        location: input.location,
        contentLength: input.content.length,
        provenance: input.provenance
      },
      outputSummary: {
        findingsCount: allFindings.length,
        highConfidenceCount: allFindings.filter(f => f.confidence >= this.config.confidenceThresholds.autoDelete).length,
        mediumConfidenceCount: allFindings.filter(f => f.confidence >= this.config.confidenceThresholds.manualReview && f.confidence < this.config.confidenceThresholds.autoDelete).length,
        lowConfidenceCount: allFindings.filter(f => f.confidence < this.config.confidenceThresholds.manualReview).length
      },
      processedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime
    }

    this.auditLog.push(auditEntry)

    return output
  }

  /**
   * Make confidence-based decisions about PII findings
   */
  categorizeFindings(findings: PIIFinding[]): {
    autoDelete: PIIFinding[]
    manualReview: PIIFinding[]
    ignore: PIIFinding[]
  } {
    // Filter out findings with invalid confidence values (NaN, null, undefined)
    const validFindings = findings.filter(f => 
      typeof f.confidence === 'number' && 
      !isNaN(f.confidence) && 
      isFinite(f.confidence)
    )

    const autoDelete = validFindings.filter(f => f.confidence >= this.config.confidenceThresholds.autoDelete)
    const manualReview = validFindings.filter(f => 
      f.confidence >= this.config.confidenceThresholds.manualReview && 
      f.confidence < this.config.confidenceThresholds.autoDelete
    )
    const ignore = validFindings.filter(f => f.confidence < this.config.confidenceThresholds.manualReview)

    return { autoDelete, manualReview, ignore }
  }

  /**
   * Get audit log entries (for compliance and debugging)
   */
  getAuditLog(): PIIAgentAuditEntry[] {
    return [...this.auditLog] // Return copy to prevent mutation
  }

  /**
   * Hash content for audit trail without storing raw content
   */
  private hashContent(content: string): string {
    // Simple hash implementation - in production, use crypto.createHash
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0')
  }

  /**
   * Clear audit log (for testing purposes)
   */
  clearAuditLog(): void {
    this.auditLog.length = 0
  }
}

// Export singleton instance
export const piiAgent = new PIIAgent()