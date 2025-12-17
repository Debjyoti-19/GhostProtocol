/**
 * Zod validation schemas for GhostProtocol GDPR erasure system
 * These schemas provide runtime validation and type safety for all data models
 */

import { z } from 'zod'

// Base schemas for common types
export const UserIdentifiersSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  emails: z.array(z.string().email('Invalid email format')),
  phones: z.array(z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone format')),
  aliases: z.array(z.string().min(1, 'Alias cannot be empty'))
})

export const LegalProofSchema = z.object({
  type: z.enum(['SIGNED_REQUEST', 'LEGAL_FORM', 'OTP_VERIFIED']),
  evidence: z.string().min(1, 'Evidence is required'),
  verifiedAt: z.string().datetime('Invalid datetime format')
})

export const RequestedBySchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: z.string().min(1, 'Role is required'),
  organization: z.string().min(1, 'Organization is required')
})

export const JurisdictionSchema = z.enum(['EU', 'US', 'OTHER'])

// ErasureRequest schema
export const ErasureRequestSchema = z.object({
  requestId: z.string().uuid('Invalid request ID format'),
  userIdentifiers: UserIdentifiersSchema,
  legalProof: LegalProofSchema,
  jurisdiction: JurisdictionSchema,
  requestedBy: RequestedBySchema,
  createdAt: z.string().datetime('Invalid datetime format'),
  workflowId: z.string().uuid('Invalid workflow ID format').optional()
})

// Workflow state schemas
export const WorkflowStatusSchema = z.enum([
  'IN_PROGRESS',
  'COMPLETED', 
  'COMPLETED_WITH_EXCEPTIONS',
  'FAILED',
  'AWAITING_MANUAL_REVIEW'
])

export const StepStatusSchema = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'DELETED',
  'FAILED',
  'LEGAL_HOLD'
])

export const StepEvidenceSchema = z.object({
  receipt: z.string().optional(),
  timestamp: z.string().datetime('Invalid datetime format'),
  apiResponse: z.any().optional()
})

export const WorkflowStepSchema = z.object({
  status: StepStatusSchema,
  attempts: z.number().int().min(0, 'Attempts must be non-negative'),
  evidence: StepEvidenceSchema
})

export const LegalHoldSchema = z.object({
  system: z.string().min(1, 'System name is required'),
  reason: z.string().min(1, 'Reason is required'),
  expiresAt: z.string().datetime('Invalid datetime format').optional()
})

export const DataLineageSnapshotSchema = z.object({
  systems: z.array(z.string().min(1, 'System name cannot be empty')),
  identifiers: z.array(z.string().min(1, 'Identifier cannot be empty')),
  capturedAt: z.string().datetime('Invalid datetime format')
})

// Background job schemas
export const JobTypeSchema = z.enum(['S3_SCAN', 'WAREHOUSE_SCAN', 'BACKUP_CHECK'])

export const JobStatusSchema = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'])

export const PIITypeSchema = z.enum(['email', 'name', 'phone', 'address', 'custom'])

export const PIIProvenanceSchema = z.object({
  messageId: z.string().optional(),
  timestamp: z.string().datetime('Invalid datetime format'),
  channel: z.string().optional()
})

export const PIIFindingSchema = z.object({
  matchId: z.string().uuid('Invalid match ID format'),
  system: z.string().min(1, 'System name is required'),
  location: z.string().min(1, 'Location is required'),
  piiType: PIITypeSchema,
  confidence: z.number().min(0, 'Confidence must be >= 0').max(1, 'Confidence must be <= 1'),
  snippet: z.string().min(1, 'Snippet is required'),
  provenance: PIIProvenanceSchema
})

export const BackgroundJobSchema = z.object({
  jobId: z.string().uuid('Invalid job ID format'),
  type: JobTypeSchema,
  workflowId: z.string().uuid('Invalid workflow ID format'),
  status: JobStatusSchema,
  progress: z.number().int().min(0, 'Progress must be >= 0').max(100, 'Progress must be <= 100'),
  checkpoints: z.array(z.string().min(1, 'Checkpoint cannot be empty')),
  findings: z.array(PIIFindingSchema)
})

export const WorkflowStateSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  userIdentifiers: UserIdentifiersSchema,
  status: WorkflowStatusSchema,
  policyVersion: z.string().min(1, 'Policy version is required'),
  legalHolds: z.array(LegalHoldSchema),
  steps: z.record(z.string(), WorkflowStepSchema),
  backgroundJobs: z.record(z.string(), BackgroundJobSchema),
  auditHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/, 'Invalid SHA-256 hash format')),
  dataLineageSnapshot: DataLineageSnapshotSchema
})

// Certificate of Destruction schemas
export const SystemReceiptSchema = z.object({
  system: z.string().min(1, 'System name is required'),
  status: z.enum(['DELETED', 'FAILED', 'LEGAL_HOLD']),
  evidence: z.string().min(1, 'Evidence is required'),
  timestamp: z.string().datetime('Invalid datetime format')
})

export const LegalHoldDocumentationSchema = z.object({
  system: z.string().min(1, 'System name is required'),
  reason: z.string().min(1, 'Reason is required'),
  justification: z.string().min(1, 'Justification is required')
})

export const CertificateOfDestructionSchema = z.object({
  certificateId: z.string().uuid('Invalid certificate ID format'),
  workflowId: z.string().uuid('Invalid workflow ID format'),
  userIdentifiers: UserIdentifiersSchema,
  completedAt: z.string().datetime('Invalid datetime format'),
  status: z.enum(['COMPLETED', 'COMPLETED_WITH_EXCEPTIONS']),
  systemReceipts: z.array(SystemReceiptSchema),
  legalHolds: z.array(LegalHoldDocumentationSchema),
  policyVersion: z.string().min(1, 'Policy version is required'),
  dataLineageSnapshot: DataLineageSnapshotSchema,
  auditHashRoot: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid SHA-256 hash format'),
  signature: z.string().min(1, 'Signature is required')
})

// Policy configuration schemas
export const RetentionRuleSchema = z.object({
  system: z.string().min(1, 'System name is required'),
  retentionDays: z.number().int().min(0, 'Retention days must be non-negative'),
  priority: z.number().int().min(1, 'Priority must be positive')
})

export const LegalHoldRuleSchema = z.object({
  system: z.string().min(1, 'System name is required'),
  conditions: z.array(z.string().min(1, 'Condition cannot be empty')),
  maxDuration: z.number().int().min(1, 'Max duration must be positive')
})

export const ConfidenceThresholdsSchema = z.object({
  autoDelete: z.number().min(0, 'Auto delete threshold must be >= 0').max(1, 'Auto delete threshold must be <= 1'),
  manualReview: z.number().min(0, 'Manual review threshold must be >= 0').max(1, 'Manual review threshold must be <= 1')
}).refine(
  (data) => data.autoDelete >= data.manualReview,
  {
    message: 'Auto delete threshold must be >= manual review threshold',
    path: ['autoDelete']
  }
)

export const PolicyConfigSchema = z.object({
  version: z.string().min(1, 'Version is required'),
  jurisdiction: JurisdictionSchema,
  retentionRules: z.array(RetentionRuleSchema),
  legalHoldRules: z.array(LegalHoldRuleSchema),
  zombieCheckInterval: z.number().int().min(1, 'Zombie check interval must be positive'),
  confidenceThresholds: ConfidenceThresholdsSchema
})

// Type exports (inferred from schemas)
export type UserIdentifiers = z.infer<typeof UserIdentifiersSchema>
export type LegalProof = z.infer<typeof LegalProofSchema>
export type RequestedBy = z.infer<typeof RequestedBySchema>
export type Jurisdiction = z.infer<typeof JurisdictionSchema>
export type ErasureRequest = z.infer<typeof ErasureRequestSchema>
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>
export type StepStatus = z.infer<typeof StepStatusSchema>
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>
export type LegalHold = z.infer<typeof LegalHoldSchema>
export type DataLineageSnapshot = z.infer<typeof DataLineageSnapshotSchema>
export type WorkflowState = z.infer<typeof WorkflowStateSchema>
export type PIIType = z.infer<typeof PIITypeSchema>
export type PIIProvenance = z.infer<typeof PIIProvenanceSchema>
export type PIIFinding = z.infer<typeof PIIFindingSchema>
export type JobType = z.infer<typeof JobTypeSchema>
export type JobStatus = z.infer<typeof JobStatusSchema>
export type BackgroundJob = z.infer<typeof BackgroundJobSchema>
export type SystemReceipt = z.infer<typeof SystemReceiptSchema>
export type LegalHoldDocumentation = z.infer<typeof LegalHoldDocumentationSchema>
export type CertificateOfDestruction = z.infer<typeof CertificateOfDestructionSchema>
export type RetentionRule = z.infer<typeof RetentionRuleSchema>
export type LegalHoldRule = z.infer<typeof LegalHoldRuleSchema>
export type ConfidenceThresholds = z.infer<typeof ConfidenceThresholdsSchema>
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>