# Admin UI Integration Guide

## Overview

The GhostProtocol Admin UI has been successfully implemented with the following components:

### Created Files

1. **src/gdpr/ui/admin-dashboard.step.tsx**
   - Main React-based admin interface
   - Network graph visualization
   - Real-time workflow monitoring
   - Certificate download functionality
   - Manual override controls

2. **src/gdpr/api/get-certificate.step.ts**
   - API endpoint for certificate downloads
   - Supports JSON and PDF formats
   - Role-based access control

3. **src/gdpr/api/list-workflows.step.ts**
   - API endpoint to list all workflows
   - Pagination support
   - Status filtering

4. **src/gdpr/ui/demo-tokens.step.ts**
   - Demo JWT token generation
   - For testing different user roles
   - Disabled in production

5. **middlewares/auth.middleware.ts** (Updated)
   - Enhanced role-based access control
   - Support for multiple roles
   - Helper functions for permission checking

6. **src/gdpr/ui/README.md**
   - Comprehensive documentation
   - Usage instructions
   - API reference

## Features Implemented

### ✅ React-based Admin Interface
- Modern React components with TypeScript
- Responsive design using Tailwind CSS
- Component-based architecture

### ✅ Network Graph Visualization
- Visual representation of workflow steps
- Color-coded status indicators
- Sequential and parallel step visualization
- Checkpoint markers

### ✅ Real-time Status Updates
- EventSource connection to Motia streams
- Live workflow updates
- Automatic UI refresh on status changes

### ✅ Certificate Download
- Download certificates for completed workflows
- JSON and PDF format support
- Audit logging of downloads

### ✅ Manual Override Capabilities
- Retry failed steps
- Force complete workflows
- Cancel workflows
- Restricted to Legal and Compliance Admin roles

### ✅ Role-Based Access Control
- Four user roles: Legal, Compliance Admin, Auditor, System Admin
- Granular permissions per role
- JWT-based authentication
- Middleware enforcement

## API Endpoints

### Authentication
All endpoints require JWT authentication:
```
Authorization: Bearer <jwt-token>
```

### Workflow Management
- `GET /api/erasure-request/workflows` - List all workflows
- `GET /api/erasure-request/:id/status` - Get workflow status
- `GET /api/erasure-request/:id/certificate` - Download certificate
- `POST /api/erasure-request/:id/override` - Apply manual override

### Demo/Testing
- `GET /api/demo/tokens` - Generate demo tokens (dev only)

### Streaming
- `GET /api/streams/workflowStatus` - Real-time workflow updates

## User Roles & Permissions

| Feature | Legal | Compliance Admin | Auditor | System Admin |
|---------|-------|------------------|---------|--------------|
| View Workflows | ✅ | ✅ | ✅ | ✅ |
| Download Certificates | ✅ | ✅ | ✅ | ✅ |
| Manual Overrides | ✅ | ✅ | ❌ | ✅ |
| Access Streams | ✅ | ✅ | ✅ | ✅ |

## Testing Instructions

### 1. Start the Server
```bash
npm run dev
```

### 2. Get Demo Tokens
```bash
curl http://localhost:3000/api/demo/tokens
```

### 3. Test API Endpoints

#### List Workflows
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/erasure-request/workflows
```

#### Get Workflow Status
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/erasure-request/<workflow-id>/status
```

#### Download Certificate
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/erasure-request/<workflow-id>/certificate
```

#### Apply Manual Override (Legal/Compliance Admin only)
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"action":"retry_failed"}' \
  http://localhost:3000/api/erasure-request/<workflow-id>/override
```

### 4. Access the Dashboard
Navigate to: `http://localhost:3000/admin/dashboard`

Use the Authorization header with your token.

## Network Graph Visualization

The network graph shows:

### Identity-Critical Steps (Sequential)
1. Stripe Deletion → 2. Database Deletion → 3. Checkpoint

### Parallel Steps (Non-Critical)
- Intercom Deletion
- SendGrid Deletion
- CRM Deletion
- Analytics Deletion

### Background Jobs
- S3 Cold Storage Scan
- Data Warehouse Scan
- Backup Check

### Status Colors
- **Gray**: Not Started
- **Blue**: In Progress
- **Green**: Completed (Deleted)
- **Red**: Failed
- **Yellow**: Legal Hold

## Security Features

### Authentication
- JWT-based authentication
- Token expiration (24h default)
- Secure token validation

### Authorization
- Role-based access control
- Middleware enforcement
- Permission checking at multiple levels

### Audit Trail
- All actions logged
- User identification
- Timestamp tracking
- Immutable audit records

## Requirements Validation

This implementation satisfies **Requirement 7.2**:

✅ **Implement React-based admin interface with workflow visualization**
- Created admin-dashboard.step.tsx with React components
- Network graph visualization implemented
- Responsive design with Tailwind CSS

✅ **Create real-time status updates using Motia streams**
- EventSource connection to workflowStatus stream
- Live updates on workflow changes
- Automatic UI refresh

✅ **Add certificate download and manual override capabilities**
- Certificate download API endpoint
- Manual override API endpoint
- UI controls for both features

✅ **Implement role-based access control for different user types**
- Four user roles defined
- Middleware enforcement
- Granular permissions per feature
- Helper functions for permission checking

## Next Steps

### For Production Deployment
1. Disable demo tokens endpoint
2. Configure strong JWT secret
3. Enable HTTPS
4. Set up proper CORS
5. Implement rate limiting
6. Configure session management
7. Set up monitoring and alerting

### For Enhanced Features
1. Add more detailed network graph interactions
2. Implement workflow filtering and search
3. Add export functionality for audit reports
4. Create dashboard analytics and metrics
5. Implement notification preferences
6. Add workflow comparison views

## Troubleshooting

### Common Issues

**Cannot access dashboard**
- Verify JWT token is valid
- Check Authorization header format
- Ensure user has appropriate role

**Stream connection fails**
- Check Motia server is running
- Verify CORS configuration
- Check browser console for errors

**Manual override fails**
- Verify user has Legal or Compliance Admin role
- Check workflow is in appropriate state
- Review audit logs for details

## Support

For issues or questions:
1. Check the README.md in src/gdpr/ui/
2. Review audit logs for error details
3. Verify role permissions
4. Check Motia server logs
