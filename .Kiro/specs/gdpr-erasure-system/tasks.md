# Implementation Plan

## The GhostProtocol Primitive Map

| Motia Primitive | Human Analogy | Role in GhostProtocol |
| :--- | :--- | :--- |
| **1. Workflow** | **The Project Manager** | The main logic (`ErasureOrchestrator`) that holds the state, enforces the sequence (Stripe → DB), and survives server crashes. |
| **2. Step** | **The Specialist Worker** | Performs the actual risky tasks: `stripe.deleteCustomer()`, `aws.deleteFile()`. If they fail, they retry without bothering the Manager. |
| **3. Sleep** | **The Cryogenic Chamber** | **(The Winning Feature)** Pauses the workflow for **30 days** post-deletion. Wakes up automatically to run the "Zombie Data Check." |
| **4. Signal** | **The Red Phone** | **"Legal Hold."** Allows a lawyer to interrupt a running deletion asynchronously. "Stop everything, we are being sued." |
| **5. Query** | **The Clipboard** | Allows the Frontend UI to ask "What % is deleted?" instantly by checking the Workflow's memory, without hitting the database. |
| **6. Child Workflow** | **The Sub-Contractor** | Isolates failures. `SalesforceDeletion` runs as a child. If Salesforce crashes, it doesn't kill the main Parent workflow. |
| **7. Cron** | **The Night Watchman** | `PolicyUpdater`. Runs every midnight to check for new GDPR legislation and update the global deletion rules. |
| **8. Continue-As-New** | **The Shift Change** | Used by the **S3 Background Scanner**. Instead of one workflow running forever (memory leak), it finishes a batch and starts a fresh copy of itself. |
| **9. Side Effect** | **The Notary** | Generates the unique **Certificate ID**. Ensures that if the workflow replays, it doesn't generate a *new* ID, but remembers the original one. |

- [x] 1. Set up project structure and core infrastructure





  - Create Motia project with proper package.json configuration (`"type": "module"`)
  - Set up TypeScript configuration and error handling middleware
  - Create base error classes following Motia patterns
  - Configure Motia with required plugins and adapters
  - _Requirements: 1.1, 6.1_

- [x] 2. Implement core data models and validation schemas







  - Create Zod schemas for ErasureRequest, WorkflowState, and CertificateOfDestruction
  - Implement PolicyConfig schema with jurisdiction-based rules
  - Create PIIFinding and BackgroundJob interfaces
  - Set up UserIdentifiers and audit trail data structures
  - _Requirements: 1.1, 6.1, 11.1_

- [x] 2.1 Write property test for data model validation



  - **Property 1: Request Validation Consistency**
  - **Validates: Requirements 1.1, 1.2**

- [x] 3. Create API layer for erasure requests





  - Implement POST /erasure-request API step with identity validation
  - Add GET /erasure-request/:id/status endpoint for workflow monitoring
  - Create POST /erasure-request/:id/override for manual legal interventions
  - Implement authentication middleware with JWT and role-based access
  - _Requirements: 1.1, 1.2, 7.2_

- [x] 3.1 Write property test for API request handling


  - **Property 2: Concurrency Control**
  - **Validates: Requirements 1.3, 1.5, 1.6**

- [x] 4. Implement workflow state management




  - Create state management service using Motia state primitives
  - Implement user locking mechanism to prevent concurrent workflows
  - Add workflow creation with data lineage snapshot capture
  - Implement idempotency checking with request hash validation
  - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 4.1 Write property test for workflow state consistency

  - **Property 3: Data Lineage Capture**
  - **Validates: Requirements 1.4, 1.7**

- [x] 5. Create identity-critical deletion steps





  - Implement Stripe deletion event step with retry logic and API response recording
  - Create database deletion event step with transaction hash recording
  - Add checkpoint validation step to mark "identity: GONE" status
  - Implement sequential ordering enforcement between critical steps
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 5.1 Write property test for sequential deletion ordering


  - **Property 4: Identity-Critical Ordering**
  - **Validates: Requirements 2.1, 2.2, 2.3**

- [x] 5.2 Write property test for critical failure handling


  - **Property 5: Critical Failure Handling**
  - **Validates: Requirements 2.4**

- [x] 6. Implement parallel deletion steps for non-critical systems




  - Create Intercom deletion event step with conversation and user data removal
  - Implement SendGrid deletion step for email lists and templates
  - Add CRM deletion step for customer record removal
  - Create analytics deletion step for tracking data removal
  - Implement controlled parallelism with checkpoint dependency
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6.1 Write property test for parallel step triggering
  - **Property 6: Parallel Step Triggering**
  - **Validates: Requirements 3.1**

- [x] 6.2 Write property test for state update consistency
  - **Property 7: State Update Consistency**
  - **Validates: Requirements 3.2**

- [x] 6.3 Write property test for retry logic

  - **Property 8: Retry Logic Correctness**
  - **Validates: Requirements 3.3, 3.4**

- [x] 7. Create PII detection agent system





  - Implement PII agent with pre-filtering using regex patterns
  - Create structured output format with confidence scoring
  - Add confidence-based decision engine (auto-delete ≥0.8, manual review 0.5-0.8)
  - Implement audit logging with data minimization (references not raw content)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 7.1 Write property test for agent pre-filtering


  - **Property 9: Agent Pre-filtering**
  - **Validates: Requirements 4.1**

- [x] 7.2 Write property test for structured output format


  - **Property 10: Structured Output Format**
  - **Validates: Requirements 4.2**

- [x] 7.3 Write property test for confidence-based actions


  - **Property 11: Confidence-Based Actions**
  - **Validates: Requirements 4.3, 4.4**

- [x] 7.4 Write property test for agent audit completeness


  - **Property 12: Agent Audit Completeness**
  - **Validates: Requirements 4.5, 4.6, 4.7**

- [x] 8. Implement background job system for cold storage scanning





  - Create resumable background jobs using Motia background job primitives
  - Implement S3 cold storage scanning with checkpoint-based resumability
  - Add progress reporting to workflow state
  - Create PII discovery handling with automatic deletion step spawning
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8.1 Write property test for job resumability


  - **Property 13: Job Resumability**
  - **Validates: Requirements 5.1, 5.3**

- [x] 8.2 Write property test for progress reporting


  - **Property 14: Progress Reporting**
  - **Validates: Requirements 5.2**

- [x] 8.3 Write property test for PII discovery handling


  - **Property 15: PII Discovery Handling**
  - **Validates: Requirements 5.4**

- [x] 8.4 Write property test for completion detection


  - **Property 16: Completion Detection**
  - **Validates: Requirements 5.5**

- [x] 9. Create audit trail and certificate generation system





  - Implement immutable audit logging with SHA-256 hash chains
  - Create tamper detection for audit trail integrity
  - Implement Certificate of Destruction generation with signed evidence
  - Add data lineage snapshot embedding in certificates
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 9.1 Write property test for immutable audit logging


  - **Property 17: Immutable Audit Logging**
  - **Validates: Requirements 6.1, 6.2, 6.5**

- [x] 9.2 Write property test for certificate generation


  - **Property 18: Certificate Generation**
  - **Validates: Requirements 6.3, 6.4, 6.6**

- [x] 10. Implement real-time monitoring with Motia streams






  - Create workflow status stream for live UI updates
  - Implement error streaming with remediation details
  - Add completion notification system for compliance teams
  - Create stream authentication for secure monitoring access
  - _Requirements: 7.1, 7.3, 7.4, 7.5_

- [x] 10.1 Write property test for live status streaming



  - **Property 19: Live Status Streaming**
  - **Validates: Requirements 7.1, 7.3**


- [x] 10.2 Write property test for error streaming


  - **Property 20: Error Streaming**

  - **Validates: Requirements 7.4**


- [x] 10.3 Write property test for completion notifications


  - **Property 21: Completion Notifications**
  - **Validates: Requirements 7.5**

- [x] 11. Create zombie data detection system





  - Implement cron step for scheduled zombie data checks
  - Add re-scanning logic for previously deleted user identifiers
  - Create automatic new workflow spawning when zombie data is detected
  - Implement audit logging for zombie check results
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 11.1 Write property test for zombie check scheduling


  - **Property 22: Zombie Check Scheduling**
  - **Validates: Requirements 8.1**

- [x] 11.2 Write property test for zombie detection and response


  - **Property 23: Zombie Detection and Response**
  - **Validates: Requirements 8.2, 8.3**

- [x] 11.3 Write property test for zombie check audit


  - **Property 24: Zombie Check Audit**
  - **Validates: Requirements 8.4, 8.5**

- [x] 12. Implement legal hold system










  - Create legal hold marking functionality for specific systems
  - Implement exclusion logic for held systems in deletion workflows
  - Add legal hold documentation in certificates with justification
  - Create legal hold expiration and resumption capabilities
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 12.1 Write property test for legal hold enforcement







  - **Property 25: Legal Hold Enforcement**
  - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 12.2 Write property test for legal hold audit


  - **Property 26: Legal Hold Audit**
  - **Validates: Requirements 9.4, 9.5**

- [x] 13. Create partial completion handling system





  - Implement COMPLETED_WITH_EXCEPTIONS workflow state
  - Add exception documentation in certificates with error evidence
  - Create audit trail clarity for distinguishing success from failure
  - Implement remediation guidance and manual override capabilities
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 13.1 Write property test for exception state handling


  - **Property 27: Exception State Handling**
  - **Validates: Requirements 10.1, 10.2, 10.3**

- [x] 13.2 Write property test for audit clarity for exceptions


  - **Property 28: Audit Clarity for Exceptions**
  - **Validates: Requirements 10.4, 10.5**

- [x] 14. Implement policy-driven workflow system





  - Create jurisdiction-based policy configuration system
  - Implement region-specific deletion rules and retention policies
  - Add policy versioning with historical record maintenance
  - Create policy reference tracking in audit trails and certificates
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 14.1 Write property test for jurisdiction-based policy application


  - **Property 29: Jurisdiction-Based Policy Application**
  - **Validates: Requirements 11.1, 11.2**

- [x] 14.2 Write property test for policy versioning and audit


  - **Property 30: Policy Versioning and Audit**
  - **Validates: Requirements 11.3, 11.4, 11.5**

- [x] 15. Create admin UI with network graph visualization




  - Implement React-based admin interface with workflow visualization
  - Create real-time status updates using Motia streams
  - Add certificate download and manual override capabilities
  - Implement role-based access control for different user types
  - _Requirements: 7.2_

- [x] 16. Set up integration connectors for external systems





  - Create mock Stripe integration for hackathon demo
  - Implement real PostgreSQL database integration
  - Add mock Intercom, SendGrid, and CRM connectors
  - Create MinIO (S3-compatible) integration for backup scanning
  - _Requirements: 2.1, 2.2, 3.1, 5.1_

- [x] 17. Checkpoint - Ensure all tests pass











  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Create demo data and scenarios






  - Generate sample user data across multiple systems
  - Create demo Slack export files for PII agent testing
  - Set up sample backup files in MinIO for background job demonstration
  - Create demo policies for different jurisdictions
  - _Requirements: All_

- [ ] 19. Final integration and demo preparation
  - Wire all components together in complete end-to-end workflow
  - Test complete erasure request lifecycle from API to certificate
  - Verify real-time UI updates and monitoring capabilities
  - Prepare demo script for 60-90 second judge presentation
  - _Requirements: All_

- [ ] 20. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.