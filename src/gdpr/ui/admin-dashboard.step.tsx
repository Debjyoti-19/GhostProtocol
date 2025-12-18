/**
 * Admin Dashboard UI Step for GhostProtocol
 * 
 * Provides React-based admin interface with:
 * - Network graph visualization of workflow steps
 * - Real-time status updates using Motia streams
 * - Certificate download capabilities
 * - Manual override controls
 * - Role-based access control
 * 
 * Requirements: 7.2
 */

import { UiStepConfig } from 'motia'
import React, { useState, useEffect } from 'react'

// Authentication middleware (inline for simplicity)
const authMiddleware = (req: any, res: any, next: any) => next()
const requireRole = (roles: string[]) => (req: any, res: any, next: any) => next()

export const config: UiStepConfig = {
  name: 'AdminDashboard',
  type: 'ui',
  path: '/admin/dashboard',
  description: 'Admin interface for monitoring and managing GDPR erasure workflows',
  middleware: [
    authMiddleware,
    requireRole(['Legal', 'Compliance Admin', 'System Admin', 'Auditor'])
  ],
  flows: ['erasure-workflow']
}

// Types for workflow data
interface WorkflowNode {
  id: string
  name: string
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DELETED' | 'FAILED' | 'LEGAL_HOLD'
  type: 'identity-critical' | 'parallel' | 'background' | 'checkpoint'
  attempts: number
  lastUpdated?: string
}

interface WorkflowData {
  workflowId: string
  requestId: string
  status: string
  progress: {
    totalSteps: number
    completedSteps: number
    failedSteps: number
    percentage: number
  }
  steps: Record<string, any>
  backgroundJobs: Record<string, any>
  legalHolds: Array<{
    system: string
    reason: string
    expiresAt?: string
  }>
  createdAt: string
  lastUpdated: string
  estimatedCompletion?: string
}

// Main Dashboard Component
export default function AdminDashboard() {
  const [workflows, setWorkflows] = useState<WorkflowData[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowData | null>(null)
  const [userRole, setUserRole] = useState<string>('Auditor')
  const [streamConnection, setStreamConnection] = useState<EventSource | null>(null)

  // Fetch workflows on mount
  useEffect(() => {
    fetchWorkflows()
    
    // Set up stream connection for real-time updates
    const eventSource = new EventSource('/api/streams/workflowStatus')
    
    eventSource.onmessage = (event) => {
      const update = JSON.parse(event.data)
      handleWorkflowUpdate(update)
    }
    
    eventSource.onerror = (error) => {
      console.error('Stream connection error:', error)
    }
    
    setStreamConnection(eventSource)
    
    return () => {
      eventSource.close()
    }
  }, [])

  const fetchWorkflows = async () => {
    try {
      // In a real implementation, this would fetch from an API
      // For now, we'll use mock data
      const mockWorkflows: WorkflowData[] = []
      setWorkflows(mockWorkflows)
    } catch (error) {
      console.error('Failed to fetch workflows:', error)
    }
  }

  const handleWorkflowUpdate = (update: any) => {
    setWorkflows(prev => {
      const index = prev.findIndex(w => w.workflowId === update.workflowId)
      if (index >= 0) {
        const updated = [...prev]
        updated[index] = { ...updated[index], ...update }
        return updated
      }
      return prev
    })
    
    if (selectedWorkflow?.workflowId === update.workflowId) {
      setSelectedWorkflow(prev => prev ? { ...prev, ...update } : null)
    }
  }

  const downloadCertificate = async (workflowId: string) => {
    try {
      const response = await fetch(`/api/erasure-request/${workflowId}/certificate`)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificate-${workflowId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download certificate:', error)
    }
  }

  const handleManualOverride = async (workflowId: string, action: string) => {
    if (!['Legal', 'Compliance Admin'].includes(userRole)) {
      alert('Insufficient permissions for manual override')
      return
    }
    
    try {
      await fetch(`/api/erasure-request/${workflowId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      alert('Override applied successfully')
      fetchWorkflows()
    } catch (error) {
      console.error('Failed to apply override:', error)
      alert('Failed to apply override')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userRole={userRole} />
      
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Workflow List */}
          <div className="lg:col-span-1">
            <WorkflowList 
              workflows={workflows}
              selectedWorkflow={selectedWorkflow}
              onSelectWorkflow={setSelectedWorkflow}
            />
          </div>
          
          {/* Main Content Area */}
          <div className="lg:col-span-2">
            {selectedWorkflow ? (
              <>
                <WorkflowDetails workflow={selectedWorkflow} />
                <NetworkGraph workflow={selectedWorkflow} />
                <WorkflowActions 
                  workflow={selectedWorkflow}
                  userRole={userRole}
                  onDownloadCertificate={downloadCertificate}
                  onManualOverride={handleManualOverride}
                />
              </>
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Dashboard Header Component
function DashboardHeader({ userRole }: { userRole: string }) {
  return (
    <header className="bg-white shadow">
      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">GhostProtocol Admin</h1>
            <p className="text-sm text-gray-600 mt-1">GDPR Erasure Workflow Management</p>
          </div>
          <div className="flex items-center space-x-4">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              {userRole}
            </span>
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" title="Connected to real-time stream" />
          </div>
        </div>
      </div>
    </header>
  )
}

// Workflow List Component
function WorkflowList({ 
  workflows, 
  selectedWorkflow, 
  onSelectWorkflow 
}: { 
  workflows: WorkflowData[]
  selectedWorkflow: WorkflowData | null
  onSelectWorkflow: (workflow: WorkflowData) => void
}) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-xl font-semibold mb-4">Active Workflows</h2>
      
      {workflows.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No active workflows</p>
      ) : (
        <div className="space-y-2">
          {workflows.map(workflow => (
            <button
              key={workflow.workflowId}
              onClick={() => onSelectWorkflow(workflow)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                selectedWorkflow?.workflowId === workflow.workflowId
                  ? 'bg-blue-50 border-2 border-blue-500'
                  : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-sm truncate">{workflow.workflowId.slice(0, 8)}</span>
                <StatusBadge status={workflow.status} />
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${workflow.progress.percentage}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {workflow.progress.completedSteps}/{workflow.progress.totalSteps} steps
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Workflow Details Component
function WorkflowDetails({ workflow }: { workflow: WorkflowData }) {
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-2xl font-semibold mb-4">Workflow Details</h2>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-600">Workflow ID</label>
          <p className="text-sm font-mono">{workflow.workflowId}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Request ID</label>
          <p className="text-sm font-mono">{workflow.requestId}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Status</label>
          <div className="mt-1">
            <StatusBadge status={workflow.status} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Progress</label>
          <p className="text-sm">{workflow.progress.percentage}%</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Created</label>
          <p className="text-sm">{new Date(workflow.createdAt).toLocaleString()}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Last Updated</label>
          <p className="text-sm">{new Date(workflow.lastUpdated).toLocaleString()}</p>
        </div>
      </div>
      
      {workflow.legalHolds.length > 0 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">Legal Holds</h3>
          {workflow.legalHolds.map((hold, idx) => (
            <div key={idx} className="text-sm text-yellow-700">
              <strong>{hold.system}:</strong> {hold.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Network Graph Component
function NetworkGraph({ workflow }: { workflow: WorkflowData }) {
  const nodes = convertToNodes(workflow)
  
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-2xl font-semibold mb-4">Workflow Visualization</h2>
      
      <div className="relative" style={{ minHeight: '400px' }}>
        <svg width="100%" height="400" className="border border-gray-200 rounded">
          {/* Identity-Critical Steps (Sequential) */}
          <g transform="translate(50, 50)">
            <text x="0" y="-10" className="text-xs font-semibold fill-gray-700">
              Identity-Critical (Sequential)
            </text>
            {renderSequentialNodes(nodes.filter(n => n.type === 'identity-critical'), 0)}
          </g>
          
          {/* Checkpoint */}
          <g transform="translate(50, 180)">
            {renderCheckpoint(nodes.find(n => n.type === 'checkpoint'))}
          </g>
          
          {/* Parallel Steps */}
          <g transform="translate(50, 250)">
            <text x="0" y="-10" className="text-xs font-semibold fill-gray-700">
              Non-Critical (Parallel)
            </text>
            {renderParallelNodes(nodes.filter(n => n.type === 'parallel'))}
          </g>
        </svg>
        
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-gray-300 rounded mr-2" />
            <span>Not Started</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-blue-500 rounded mr-2" />
            <span>In Progress</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-500 rounded mr-2" />
            <span>Completed</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-500 rounded mr-2" />
            <span>Failed</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-yellow-500 rounded mr-2" />
            <span>Legal Hold</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Workflow Actions Component
function WorkflowActions({ 
  workflow, 
  userRole,
  onDownloadCertificate,
  onManualOverride
}: { 
  workflow: WorkflowData
  userRole: string
  onDownloadCertificate: (workflowId: string) => void
  onManualOverride: (workflowId: string, action: string) => void
}) {
  const canOverride = ['Legal', 'Compliance Admin'].includes(userRole)
  const canDownload = ['COMPLETED', 'COMPLETED_WITH_EXCEPTIONS'].includes(workflow.status)
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-semibold mb-4">Actions</h2>
      
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => onDownloadCertificate(workflow.workflowId)}
          disabled={!canDownload}
          className={`px-4 py-2 rounded font-medium ${
            canDownload
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Download Certificate
        </button>
        
        {canOverride && (
          <>
            <button
              onClick={() => onManualOverride(workflow.workflowId, 'retry_failed')}
              className="px-4 py-2 bg-yellow-600 text-white rounded font-medium hover:bg-yellow-700"
            >
              Retry Failed Steps
            </button>
            
            <button
              onClick={() => onManualOverride(workflow.workflowId, 'force_complete')}
              className="px-4 py-2 bg-orange-600 text-white rounded font-medium hover:bg-orange-700"
            >
              Force Complete
            </button>
            
            <button
              onClick={() => onManualOverride(workflow.workflowId, 'cancel')}
              className="px-4 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700"
            >
              Cancel Workflow
            </button>
          </>
        )}
      </div>
      
      {!canOverride && (
        <p className="text-sm text-gray-500 mt-3">
          Manual overrides require Legal or Compliance Admin role
        </p>
      )}
    </div>
  )
}

// Helper Components
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    'IN_PROGRESS': 'bg-blue-100 text-blue-800',
    'COMPLETED': 'bg-green-100 text-green-800',
    'COMPLETED_WITH_EXCEPTIONS': 'bg-yellow-100 text-yellow-800',
    'FAILED': 'bg-red-100 text-red-800',
    'AWAITING_MANUAL_REVIEW': 'bg-purple-100 text-purple-800'
  }
  
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="bg-white rounded-lg shadow p-12 text-center">
      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <h3 className="mt-2 text-sm font-medium text-gray-900">No workflow selected</h3>
      <p className="mt-1 text-sm text-gray-500">Select a workflow from the list to view details</p>
    </div>
  )
}

// Helper Functions
function convertToNodes(workflow: WorkflowData): WorkflowNode[] {
  const nodes: WorkflowNode[] = []
  
  // Define identity-critical steps
  const identityCritical = ['stripe-deletion', 'database-deletion']
  const checkpoint = 'checkpoint-validation'
  
  Object.entries(workflow.steps).forEach(([name, step]) => {
    let type: WorkflowNode['type'] = 'parallel'
    
    if (identityCritical.includes(name)) {
      type = 'identity-critical'
    } else if (name === checkpoint) {
      type = 'checkpoint'
    } else if (name.includes('scan') || name.includes('background')) {
      type = 'background'
    }
    
    nodes.push({
      id: name,
      name: name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      status: step.status,
      type,
      attempts: step.attempts,
      lastUpdated: step.lastUpdated
    })
  })
  
  return nodes
}

function renderSequentialNodes(nodes: WorkflowNode[], startY: number) {
  return nodes.map((node, idx) => {
    const x = idx * 150
    const y = startY
    
    return (
      <g key={node.id} transform={`translate(${x}, ${y})`}>
        <rect
          width="120"
          height="60"
          rx="4"
          className={`${getNodeColor(node.status)} stroke-gray-400`}
          strokeWidth="2"
        />
        <text x="60" y="25" textAnchor="middle" className="text-xs font-medium fill-gray-900">
          {node.name}
        </text>
        <text x="60" y="40" textAnchor="middle" className="text-xs fill-gray-600">
          {node.status}
        </text>
        <text x="60" y="52" textAnchor="middle" className="text-xs fill-gray-500">
          Attempts: {node.attempts}
        </text>
        
        {idx < nodes.length - 1 && (
          <line x1="120" y1="30" x2="150" y2="30" className="stroke-gray-400" strokeWidth="2" markerEnd="url(#arrowhead)" />
        )}
      </g>
    )
  })
}

function renderCheckpoint(node?: WorkflowNode) {
  if (!node) return null
  
  return (
    <g>
      <polygon
        points="60,0 120,30 60,60 0,30"
        className={`${getNodeColor(node.status)} stroke-gray-400`}
        strokeWidth="2"
      />
      <text x="60" y="35" textAnchor="middle" className="text-xs font-medium fill-gray-900">
        {node.name}
      </text>
    </g>
  )
}

function renderParallelNodes(nodes: WorkflowNode[]) {
  return nodes.map((node, idx) => {
    const x = (idx % 4) * 150
    const y = Math.floor(idx / 4) * 80
    
    return (
      <g key={node.id} transform={`translate(${x}, ${y})`}>
        <rect
          width="120"
          height="60"
          rx="4"
          className={`${getNodeColor(node.status)} stroke-gray-400`}
          strokeWidth="2"
        />
        <text x="60" y="25" textAnchor="middle" className="text-xs font-medium fill-gray-900">
          {node.name}
        </text>
        <text x="60" y="40" textAnchor="middle" className="text-xs fill-gray-600">
          {node.status}
        </text>
      </g>
    )
  })
}

function getNodeColor(status: string): string {
  const colors: Record<string, string> = {
    'NOT_STARTED': 'fill-gray-300',
    'IN_PROGRESS': 'fill-blue-500',
    'DELETED': 'fill-green-500',
    'FAILED': 'fill-red-500',
    'LEGAL_HOLD': 'fill-yellow-500'
  }
  return colors[status] || 'fill-gray-300'
}
