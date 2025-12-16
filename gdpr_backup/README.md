# GhostProtocol GDPR Erasure System

## Overview

GhostProtocol is a forward-only, durable orchestration engine built on Motia that systematically handles Right-to-Be-Forgotten requests (GDPR/CCPA) by removing personal data across fragmented SaaS stacks within legal windows with provable evidence.

## Infrastructure Setup

This directory contains the core infrastructure for the GhostProtocol system:

### Error Handling (`/errors`)
- **BaseError**: Foundation error class with structured metadata and HTTP status codes
- **GhostProtocolError**: Base class for all system-specific errors
- **Specialized Errors**: WorkflowLockError, LegalHoldError, IdentityValidationError, etc.

### Utilities (`/utils`)
- **CryptoUtils**: SHA-256 hashing, hash chains, digital signatures, certificate ID generation
- Tamper-evident audit trail support
- Certificate generation utilities

### Configuration (`/config`)
- **ghostProtocolConfig**: Centralized configuration for all system components
- Workflow settings, PII agent thresholds, background job limits
- External system timeouts and retry policies

### Types (`/types`)
- Core TypeScript interfaces and type definitions
- UserIdentifiers, WorkflowStatus, StepStatus, PIIType, etc.

## Middleware (`/middlewares`)

### Error Handler Middleware
- Handles Zod validation errors with structured responses
- Converts custom errors to appropriate HTTP responses
- Logs unexpected errors for debugging

### Audit Logger Middleware
- Logs all requests and responses for compliance
- Generates unique request IDs for tracing
- Records timing and error information

### Authentication Middleware
- JWT token validation
- Role-based access control (Legal, Compliance Admin, Auditor)
- User context injection

## Key Features

### Tamper-Evident Audit Trail
- SHA-256 hash chains for immutable audit logs
- Cryptographic signatures for certificates
- Tamper detection and verification

### Error Handling
- Structured error responses with metadata
- HTTP status code mapping
- Comprehensive error classification

### Security
- JWT-based authentication
- Role-based authorization
- Audit logging for all operations

## Testing

Run the infrastructure tests:
```bash
npx vitest --run src/gdpr/test-setup.test.ts
```

Tests cover:
- Error creation and metadata
- Cryptographic utilities
- Hash chain integrity
- Configuration loading

## Next Steps

This infrastructure provides the foundation for:
1. Data models and validation schemas (Task 2)
2. API layer for erasure requests (Task 3)
3. Workflow state management (Task 4)
4. Deletion steps and orchestration (Tasks 5-6)
5. PII detection agents (Task 7)
6. Background job system (Task 8)
7. Certificate generation (Task 9)
8. Real-time monitoring (Task 10)
9. Zombie data detection (Task 11)
10. Legal hold system (Task 12)
11. Partial completion handling (Task 13)
12. Policy-driven workflows (Task 14)