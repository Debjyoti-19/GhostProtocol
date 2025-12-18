# GhostProtocol Admin Dashboard

React-based admin interface for monitoring and managing GDPR erasure workflows.

## Features

- **Network Graph Visualization**: Visual representation of workflow steps and their status
- **Real-time Updates**: Live status updates using Motia streams
- **Certificate Downloads**: Download certificates of destruction for completed workflows
- **Manual Overrides**: Legal and Compliance Admin can manually override workflow states
- **Role-Based Access Control**: Different permissions for Legal, Compliance Admin, Auditor, and System Admin roles

## User Roles

### Legal
- View all workflows
- Download certificates
- Apply manual overrides
- Access real-time monitoring

### Compliance Admin
- View all workflows
- Download certificates
- Apply manual overrides
- Access real-time monitoring

### Auditor
- View all workflows
- Download certificates
- Access real-time monitoring
- **Cannot** apply manual overrides

### System Admin
- Full access to all features
- Can perform any action

## Getting Started

### 1. Start the Motia Server

```bash
npm run dev
```

### 2. Get Demo Tokens (Development Only)

```bash
curl http://localhost:3000/api/demo/tokens
```

This will return JWT tokens for each role:

```json
{
  "tokens": {
    "Legal": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "Compliance Admin": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "Auditor": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "System Admin": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 3. Access the Dashboard

Navigate to: `http://localhost:3000/admin/dashboard`

Add the Authorization header with your token:
```
Authorization: Bearer <your-token>
```

## API Endpoints

### List Workflows
```
GET /api/erasure-request/workflows
```

Query parameters:
- `status`: Filter by workflow status
- `page`: Page number (default: 1)
- `pageSize`: Items per page (default: 20)

### Get Workflow Status
```
GET /api/erasure-request/:id/status
```

Query parameters:
- `includeDetails`: Include detailed step information
- `includeJobs`: Include background job details

### Download Certificate
```
GET /api/erasure-request/:id/certificate
```

Query parameters:
- `format`: Certificate format (json or pdf)

### Manual Override
```
POST /api/erasure-request/:id/override
```

Body:
```json
{
  "action": "retry_failed" | "force_complete" | "cancel"
}
```

## Real-time Streaming

The dashboard connects to the workflow status stream for live updates:

```javascript
const eventSource = new EventSource('/api/streams/workflowStatus')

eventSource.onmessage = (event) => {
  const update = JSON.parse(event.data)
  // Handle workflow update
}
```

## Network Graph

The network graph visualizes:

1. **Identity-Critical Steps** (Sequential)
   - Stripe Deletion
   - Database Deletion

2. **Checkpoint**
   - Identity: GONE validation

3. **Parallel Steps** (Non-Critical)
   - Intercom Deletion
   - SendGrid Deletion
   - CRM Deletion
   - Analytics Deletion

4. **Background Jobs**
   - S3 Cold Storage Scan
   - Data Warehouse Scan
   - Backup Check

### Node Colors

- **Gray**: Not Started
- **Blue**: In Progress
- **Green**: Completed (Deleted)
- **Red**: Failed
- **Yellow**: Legal Hold

## Manual Override Actions

### Retry Failed Steps
Retries all failed steps in the workflow. Useful when external systems were temporarily unavailable.

### Force Complete
Marks the workflow as completed even with failed steps. Creates a COMPLETED_WITH_EXCEPTIONS state. Requires legal justification.

### Cancel Workflow
Cancels the workflow and prevents further execution. Cannot be undone.

## Security

### Authentication
All endpoints require JWT authentication via the Authorization header:
```
Authorization: Bearer <jwt-token>
```

### Role-Based Access Control
- Endpoints check user roles before allowing access
- Manual overrides restricted to Legal and Compliance Admin
- Certificate downloads available to Legal, Compliance Admin, and Auditor
- All roles can view workflow status

### Audit Trail
All actions are logged to the audit trail:
- Status queries
- Certificate downloads
- Manual overrides
- Stream connections

## Development

### Testing with Different Roles

1. Get tokens for all roles:
```bash
curl http://localhost:3000/api/demo/tokens
```

2. Test with different roles to verify RBAC:
```bash
# As Auditor (can view, cannot override)
curl -H "Authorization: Bearer <auditor-token>" \
  http://localhost:3000/api/erasure-request/workflows

# As Legal (can override)
curl -X POST \
  -H "Authorization: Bearer <legal-token>" \
  -H "Content-Type: application/json" \
  -d '{"action":"retry_failed"}' \
  http://localhost:3000/api/erasure-request/<workflow-id>/override
```

### Adding New Features

1. Update the UI component in `admin-dashboard.step.tsx`
2. Add new API endpoints as needed
3. Update role permissions in `middlewares/auth.middleware.ts`
4. Test with all user roles

## Production Deployment

### Security Checklist

- [ ] Disable `/demo/tokens` endpoint
- [ ] Use strong JWT secret from environment variable
- [ ] Enable HTTPS for all connections
- [ ] Configure CORS properly
- [ ] Set up rate limiting
- [ ] Enable audit logging
- [ ] Configure session timeouts
- [ ] Implement token refresh mechanism

### Environment Variables

```bash
JWT_SECRET=<strong-random-secret>
NODE_ENV=production
STREAM_AUTH_ENABLED=true
```

## Troubleshooting

### Cannot Connect to Stream
- Check that the Motia server is running
- Verify authentication token is valid
- Check browser console for CORS errors

### Manual Override Fails
- Verify user has Legal or Compliance Admin role
- Check workflow is in a state that allows overrides
- Review audit logs for detailed error messages

### Certificate Download Fails
- Ensure workflow is in COMPLETED or COMPLETED_WITH_EXCEPTIONS state
- Verify user has appropriate role
- Check that certificate was generated successfully

## Requirements Validation

This implementation satisfies **Requirement 7.2**:
- ✅ React-based admin interface
- ✅ Network graph visualization of workflow steps
- ✅ Real-time status updates using Motia streams
- ✅ Certificate download capabilities
- ✅ Manual override controls
- ✅ Role-based access control for different user types
