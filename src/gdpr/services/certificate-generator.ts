/**
 * Certificate of Destruction generator for GhostProtocol
 * Creates legally defensible certificates with signed evidence
 */

import { CryptoUtils } from '../utils/crypto.js'
import { AuditTrail } from './audit-trail.js'
import type {
  CertificateOfDestruction,
  WorkflowState,
  SystemReceipt,
  LegalHoldDocumentation,
  UserIdentifiers,
  DataLineageSnapshot
} from '../types/index.js'

export interface CertificateGenerationOptions {
  workflowState: WorkflowState
  auditTrail: AuditTrail
  privateKey?: string
  redactUserIdentifiers?: boolean
}

export class CertificateGenerator {
  
  /**
   * Generates a Certificate of Destruction from workflow state and audit trail
   */
  static generateCertificate(options: CertificateGenerationOptions): CertificateOfDestruction {
    const { workflowState, auditTrail, privateKey, redactUserIdentifiers = true } = options

    // Verify audit trail integrity before generating certificate
    if (!auditTrail.verifyIntegrity()) {
      throw new Error('Cannot generate certificate: audit trail integrity check failed')
    }

    // Generate unique certificate ID
    const certificateId = CryptoUtils.generateCertificateId()

    // Create system receipts from workflow steps
    const systemReceipts = this.createSystemReceipts(workflowState)

    // Create legal hold documentation
    const legalHolds = this.createLegalHoldDocumentation(workflowState.legalHolds)

    // Redact user identifiers if requested
    const userIdentifiers = redactUserIdentifiers 
      ? this.redactUserIdentifiers(workflowState.userIdentifiers)
      : workflowState.userIdentifiers

    // Get audit hash root
    const auditHashRoot = auditTrail.getHashRoot()

    // Determine completion status
    const status = workflowState.status === 'COMPLETED' ? 'COMPLETED' : 'COMPLETED_WITH_EXCEPTIONS'

    // Create certificate data
    const certificateData: Omit<CertificateOfDestruction, 'signature'> = {
      certificateId,
      workflowId: workflowState.workflowId,
      userIdentifiers,
      completedAt: new Date().toISOString(),
      status,
      systemReceipts,
      legalHolds,
      policyVersion: workflowState.policyVersion,
      dataLineageSnapshot: workflowState.dataLineageSnapshot,
      auditHashRoot
    }

    // Sign the certificate
    const signature = CryptoUtils.signData(certificateData, privateKey)

    return {
      ...certificateData,
      signature
    }
  }

  /**
   * Verifies a certificate's signature and integrity
   */
  static verifyCertificate(certificate: CertificateOfDestruction, publicKey?: string): boolean {
    const { signature, ...certificateData } = certificate
    return CryptoUtils.verifySignature(certificateData, signature, publicKey)
  }

  /**
   * Creates system receipts from workflow steps
   */
  private static createSystemReceipts(workflowState: WorkflowState): SystemReceipt[] {
    return Object.entries(workflowState.steps).map(([stepName, step]) => {
      let status: SystemReceipt['status']
      
      switch (step.status) {
        case 'DELETED':
          status = 'DELETED'
          break
        case 'LEGAL_HOLD':
          status = 'LEGAL_HOLD'
          break
        case 'FAILED':
        case 'NOT_STARTED':
        case 'IN_PROGRESS':
        default:
          status = 'FAILED'
          break
      }

      return {
        system: stepName,
        status,
        evidence: step.evidence.receipt || `Step ${step.status.toLowerCase()} with ${step.attempts} attempts`,
        timestamp: step.evidence.timestamp
      }
    })
  }

  /**
   * Creates legal hold documentation from legal holds
   */
  private static createLegalHoldDocumentation(legalHolds: WorkflowState['legalHolds']): LegalHoldDocumentation[] {
    return legalHolds.map(hold => ({
      system: hold.system,
      reason: hold.reason,
      justification: `Legal hold applied: ${hold.reason}${hold.expiresAt ? ` (expires: ${hold.expiresAt})` : ''}`
    }))
  }

  /**
   * Redacts sensitive information from user identifiers
   */
  private static redactUserIdentifiers(userIdentifiers: UserIdentifiers): UserIdentifiers {
    return {
      userId: this.redactString(userIdentifiers.userId),
      emails: userIdentifiers.emails.map(email => this.redactEmail(email)),
      phones: userIdentifiers.phones.map(phone => this.redactPhone(phone)),
      aliases: userIdentifiers.aliases.map(alias => this.redactString(alias))
    }
  }

  /**
   * Redacts email addresses while preserving domain for verification
   */
  private static redactEmail(email: string): string {
    const [localPart, domain] = email.split('@')
    if (!domain) return '***@***'
    
    const redactedLocal = localPart.length > 2 
      ? `${localPart[0]}***${localPart[localPart.length - 1]}`
      : '***'
    
    return `${redactedLocal}@${domain}`
  }

  /**
   * Redacts phone numbers while preserving country code
   */
  private static redactPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length < 4) return '***'
    
    const countryCode = cleaned.startsWith('1') ? '+1' : cleaned.substring(0, 2)
    return `${countryCode}***${cleaned.slice(-2)}`
  }

  /**
   * Redacts strings while preserving first and last characters
   */
  private static redactString(str: string): string {
    if (str.length <= 2) return '***'
    return `${str[0]}***${str[str.length - 1]}`
  }

  /**
   * Validates certificate completeness and required fields
   */
  static validateCertificate(certificate: CertificateOfDestruction): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Check required fields
    if (!certificate.certificateId) errors.push('Missing certificate ID')
    if (!certificate.workflowId) errors.push('Missing workflow ID')
    if (!certificate.completedAt) errors.push('Missing completion timestamp')
    if (!certificate.signature) errors.push('Missing signature')
    if (!certificate.auditHashRoot) errors.push('Missing audit hash root')
    if (!certificate.policyVersion) errors.push('Missing policy version')

    // Validate user identifiers structure
    if (!certificate.userIdentifiers) {
      errors.push('Missing user identifiers')
    } else {
      if (!certificate.userIdentifiers.userId) errors.push('Missing user ID')
      if (!Array.isArray(certificate.userIdentifiers.emails)) errors.push('Invalid emails array')
      if (!Array.isArray(certificate.userIdentifiers.phones)) errors.push('Invalid phones array')
      if (!Array.isArray(certificate.userIdentifiers.aliases)) errors.push('Invalid aliases array')
    }

    // Validate system receipts
    if (!Array.isArray(certificate.systemReceipts)) {
      errors.push('Invalid system receipts array')
    } else {
      certificate.systemReceipts.forEach((receipt, index) => {
        if (!receipt.system) errors.push(`System receipt ${index}: missing system name`)
        if (!receipt.status) errors.push(`System receipt ${index}: missing status`)
        if (!receipt.evidence) errors.push(`System receipt ${index}: missing evidence`)
        if (!receipt.timestamp) errors.push(`System receipt ${index}: missing timestamp`)
      })
    }

    // Validate data lineage snapshot
    if (!certificate.dataLineageSnapshot) {
      errors.push('Missing data lineage snapshot')
    } else {
      if (!Array.isArray(certificate.dataLineageSnapshot.systems)) {
        errors.push('Invalid data lineage systems array')
      }
      if (!Array.isArray(certificate.dataLineageSnapshot.identifiers)) {
        errors.push('Invalid data lineage identifiers array')
      }
      if (!certificate.dataLineageSnapshot.capturedAt) {
        errors.push('Missing data lineage capture timestamp')
      }
    }

    // Validate legal holds array
    if (!Array.isArray(certificate.legalHolds)) {
      errors.push('Invalid legal holds array')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Extracts certificate summary for display purposes
   */
  static getCertificateSummary(certificate: CertificateOfDestruction): {
    certificateId: string
    workflowId: string
    completedAt: string
    status: string
    systemsProcessed: number
    systemsDeleted: number
    systemsFailed: number
    legalHoldsCount: number
  } {
    const systemsDeleted = certificate.systemReceipts.filter(r => r.status === 'DELETED').length
    const systemsFailed = certificate.systemReceipts.filter(r => r.status === 'FAILED').length

    return {
      certificateId: certificate.certificateId,
      workflowId: certificate.workflowId,
      completedAt: certificate.completedAt,
      status: certificate.status,
      systemsProcessed: certificate.systemReceipts.length,
      systemsDeleted,
      systemsFailed,
      legalHoldsCount: certificate.legalHolds.length
    }
  }
}