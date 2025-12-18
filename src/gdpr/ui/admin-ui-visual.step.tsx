/**
 * Admin UI Visual Step for Motia Workbench
 * 
 * Provides a visual representation of the admin dashboard in the workflow graph
 * Requirements: 7.2
 */

import { UiStepConfig } from 'motia'
import React from 'react'

export const config: UiStepConfig = {
  name: 'AdminUIVisual',
  type: 'ui',
  path: '/workbench/admin-ui-visual',
  description: 'Visual representation of Admin Dashboard in workflow',
  flows: ['erasure-workflow']
}

export default function AdminUIVisual() {
  return (
    <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>
          <p className="text-sm text-gray-600 mt-1">Real-time Workflow Monitoring & Control</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm text-gray-600">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Features */}
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
            <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Network Graph
          </h3>
          <p className="text-sm text-gray-600">Visual workflow step visualization with real-time status</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
            <svg className="w-5 h-5 mr-2 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Live Updates
          </h3>
          <p className="text-sm text-gray-600">Real-time streaming via Motia streams</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
            <svg className="w-5 h-5 mr-2 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Certificates
          </h3>
          <p className="text-sm text-gray-600">Download certificates of destruction</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
            <svg className="w-5 h-5 mr-2 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            RBAC
          </h3>
          <p className="text-sm text-gray-600">Role-based access control for 4 user types</p>
        </div>
      </div>

      {/* User Roles */}
      <div className="bg-white rounded-lg p-4 shadow mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">User Roles</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="px-3 py-2 bg-blue-100 text-blue-800 rounded text-sm font-medium text-center">
            Legal
          </div>
          <div className="px-3 py-2 bg-green-100 text-green-800 rounded text-sm font-medium text-center">
            Compliance Admin
          </div>
          <div className="px-3 py-2 bg-purple-100 text-purple-800 rounded text-sm font-medium text-center">
            Auditor
          </div>
          <div className="px-3 py-2 bg-orange-100 text-orange-800 rounded text-sm font-medium text-center">
            System Admin
          </div>
        </div>
      </div>

      {/* Manual Override Actions */}
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold text-gray-900 mb-3">Manual Override Actions</h3>
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
            Retry Failed
          </span>
          <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium">
            Force Complete
          </span>
          <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
            Cancel Workflow
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Available to Legal and Compliance Admin roles only
        </p>
      </div>

      {/* Access Info */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-900">Access the Dashboard</p>
            <p className="text-xs text-blue-700 mt-1">
              Navigate to <code className="bg-blue-100 px-1 py-0.5 rounded">/admin/dashboard</code> with valid JWT token
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
