/**
 * Remediation Guidance Service for GhostProtocol
 * Provides actionable guidance for failed deletion steps
 */

import type { WorkflowState, StepStatus } from '../types/index.js'

export interface RemediationGuidance {
  system: string
  status: StepStatus
  issue: string
  guidance: string
  actions: RemediationAction[]
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  estimatedResolutionTime?: string
}

export interface RemediationAction {
  action: 'RETRY' | 'MANUAL_INTERVENTION' | 'CONTACT_VENDOR' | 'LEGAL_HOLD' | 'FORCE_COMPLETE'
  description: string
  requiresApproval: boolean
  approvalRole?: string
}

export class RemediationGuidanceService {
  /**
   * Generates remediation guidance for all failed steps in a workflow
   */
  static generateGuidance(workflowState: WorkflowState): RemediationGuidance[] {
    const guidance: RemediationGuidance[] = []

    // Analyze each step
    for (const [stepName, step] of Object.entries(workflowState.steps)) {
      if (step.status === 'FAILED') {
        guidance.push(this.generateStepGuidance(stepName, step, workflowState))
      }
    }

    // Sort by priority
    return guidance.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })
  }

  /**
   * Generates remediation guidance for a specific failed step
   */
  private static generateStepGuidance(
    stepName: string,
    step: WorkflowState['steps'][string],
    workflowState: WorkflowState
  ): RemediationGuidance {
    // Extract error information from evidence
    const errorInfo = this.extractErrorInfo(step)
    
    // Determine issue type and generate appropriate guidance
    const { issue, guidance, actions, priority, estimatedResolutionTime } = 
      this.analyzeFailure(stepName, errorInfo, step.attempts)

    return {
      system: stepName,
      status: step.status,
      issue,
      guidance,
      actions,
      priority,
      estimatedResolutionTime
    }
  }

  /**
   * Extracts error information from step evidence
   */
  private static extractErrorInfo(step: WorkflowState['steps'][string]): {
    errorType?: string
    errorMessage?: string
    lastAttempt?: string
  } {
    const evidence = step.evidence

    // Try to parse apiResponse if it exists
    if (evidence.apiResponse) {
      return {
        errorType: evidence.apiResponse.errorType || evidence.apiResponse.status,
        errorMessage: evidence.apiResponse.error || evidence.apiResponse.message,
        lastAttempt: evidence.timestamp
      }
    }

    // Try to extract from receipt
    if (evidence.receipt) {
      return {
        errorMessage: evidence.receipt,
        lastAttempt: evidence.timestamp
      }
    }

    return {
      errorMessage: 'Unknown error',
      lastAttempt: evidence.timestamp
    }
  }

  /**
   * Analyzes failure and provides specific guidance
   */
  private static analyzeFailure(
    stepName: string,
    errorInfo: ReturnType<typeof RemediationGuidanceService.extractErrorInfo>,
    attempts: number
  ): {
    issue: string
    guidance: string
    actions: RemediationAction[]
    priority: 'HIGH' | 'MEDIUM' | 'LOW'
    estimatedResolutionTime?: string
  } {
    const errorType = errorInfo.errorType?.toLowerCase() || ''
    const errorMessage = errorInfo.errorMessage?.toLowerCase() || ''

    // Timeout errors
    if (errorType.includes('timeout') || errorMessage.includes('timeout')) {
      return {
        issue: 'System timeout - request exceeded time limit',
        guidance: `The ${stepName} system did not respond within the expected timeframe. This may be due to high load or network issues.`,
        actions: [
          {
            action: 'RETRY',
            description: 'Retry the deletion operation during off-peak hours',
            requiresApproval: false
          },
          {
            action: 'CONTACT_VENDOR',
            description: 'Contact system administrator to check system health',
            requiresApproval: false
          },
          {
            action: 'FORCE_COMPLETE',
            description: 'Document best-effort attempt and force complete workflow',
            requiresApproval: true,
            approvalRole: 'legal_counsel'
          }
        ],
        priority: 'MEDIUM',
        estimatedResolutionTime: '1-2 hours'
      }
    }

    // Authentication/Authorization errors
    if (errorType.includes('auth') || errorMessage.includes('auth') || 
        errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
      return {
        issue: 'Authentication or authorization failure',
        guidance: `Access credentials for ${stepName} are invalid or insufficient. API keys or tokens may have expired.`,
        actions: [
          {
            action: 'MANUAL_INTERVENTION',
            description: 'Update API credentials and retry',
            requiresApproval: true,
            approvalRole: 'system_admin'
          },
          {
            action: 'CONTACT_VENDOR',
            description: 'Contact vendor to verify account status and permissions',
            requiresApproval: false
          }
        ],
        priority: 'HIGH',
        estimatedResolutionTime: '2-4 hours'
      }
    }

    // Rate limiting errors
    if (errorType.includes('rate') || errorMessage.includes('rate limit') || 
        errorMessage.includes('too many requests')) {
      return {
        issue: 'Rate limit exceeded',
        guidance: `The ${stepName} system has rate limits that have been exceeded. Requests must be throttled.`,
        actions: [
          {
            action: 'RETRY',
            description: 'Retry after rate limit window expires (typically 1 hour)',
            requiresApproval: false
          },
          {
            action: 'CONTACT_VENDOR',
            description: 'Request rate limit increase for compliance operations',
            requiresApproval: false
          }
        ],
        priority: 'LOW',
        estimatedResolutionTime: '1-24 hours'
      }
    }

    // System unavailable errors
    if (errorMessage.includes('unavailable') || errorMessage.includes('not found') || 
        errorMessage.includes('connection') || errorType.includes('network')) {
      return {
        issue: 'System unavailable or unreachable',
        guidance: `The ${stepName} system is currently unavailable. This may be due to maintenance, outage, or network issues.`,
        actions: [
          {
            action: 'RETRY',
            description: 'Retry after system becomes available',
            requiresApproval: false
          },
          {
            action: 'CONTACT_VENDOR',
            description: 'Check system status page or contact vendor support',
            requiresApproval: false
          },
          {
            action: 'LEGAL_HOLD',
            description: 'Place system under legal hold until available',
            requiresApproval: true,
            approvalRole: 'legal_counsel'
          },
          {
            action: 'FORCE_COMPLETE',
            description: 'Document unavailability and force complete if deadline approaching',
            requiresApproval: true,
            approvalRole: 'legal_counsel'
          }
        ],
        priority: 'HIGH',
        estimatedResolutionTime: 'Unknown - depends on vendor'
      }
    }

    // High retry count - persistent failure
    if (attempts >= 3) {
      return {
        issue: 'Persistent failure after multiple retry attempts',
        guidance: `The ${stepName} deletion has failed ${attempts} times. This indicates a systemic issue requiring manual intervention.`,
        actions: [
          {
            action: 'MANUAL_INTERVENTION',
            description: 'Manually delete data through system UI or contact vendor',
            requiresApproval: true,
            approvalRole: 'compliance_officer'
          },
          {
            action: 'CONTACT_VENDOR',
            description: 'Escalate to vendor support with error details',
            requiresApproval: false
          },
          {
            action: 'FORCE_COMPLETE',
            description: 'Document best-effort attempts and force complete workflow',
            requiresApproval: true,
            approvalRole: 'legal_counsel'
          }
        ],
        priority: 'HIGH',
        estimatedResolutionTime: '4-24 hours'
      }
    }

    // Generic failure
    return {
      issue: 'Deletion operation failed',
      guidance: `The ${stepName} deletion failed with error: ${errorInfo.errorMessage}. Review error details and determine appropriate action.`,
      actions: [
        {
          action: 'RETRY',
          description: 'Retry the deletion operation',
          requiresApproval: false
        },
        {
          action: 'MANUAL_INTERVENTION',
          description: 'Investigate error and manually resolve',
          requiresApproval: true,
          approvalRole: 'compliance_officer'
        },
        {
          action: 'CONTACT_VENDOR',
          description: 'Contact vendor support for assistance',
          requiresApproval: false
        }
      ],
      priority: 'MEDIUM',
      estimatedResolutionTime: '2-8 hours'
    }
  }

  /**
   * Generates a summary report of all remediation guidance
   */
  static generateRemediationReport(workflowState: WorkflowState): {
    workflowId: string
    status: WorkflowState['status']
    totalFailures: number
    highPriority: number
    mediumPriority: number
    lowPriority: number
    guidance: RemediationGuidance[]
    summary: string
  } {
    const guidance = this.generateGuidance(workflowState)
    
    const highPriority = guidance.filter(g => g.priority === 'HIGH').length
    const mediumPriority = guidance.filter(g => g.priority === 'MEDIUM').length
    const lowPriority = guidance.filter(g => g.priority === 'LOW').length

    let summary = ''
    if (guidance.length === 0) {
      summary = 'No failed steps requiring remediation.'
    } else {
      summary = `${guidance.length} failed step(s) require attention. `
      if (highPriority > 0) {
        summary += `${highPriority} high priority issue(s) require immediate action. `
      }
      if (mediumPriority > 0) {
        summary += `${mediumPriority} medium priority issue(s) should be addressed soon. `
      }
      if (lowPriority > 0) {
        summary += `${lowPriority} low priority issue(s) can be addressed when convenient.`
      }
    }

    return {
      workflowId: workflowState.workflowId,
      status: workflowState.status,
      totalFailures: guidance.length,
      highPriority,
      mediumPriority,
      lowPriority,
      guidance,
      summary
    }
  }

  /**
   * Checks if a workflow requires manual intervention
   */
  static requiresManualIntervention(workflowState: WorkflowState): boolean {
    const guidance = this.generateGuidance(workflowState)
    return guidance.some(g => g.priority === 'HIGH')
  }

  /**
   * Gets recommended next action for a workflow
   */
  static getRecommendedAction(workflowState: WorkflowState): {
    action: string
    description: string
    requiresApproval: boolean
    approvalRole?: string
  } | null {
    const guidance = this.generateGuidance(workflowState)
    
    if (guidance.length === 0) {
      return null
    }

    // Get highest priority guidance
    const highestPriority = guidance[0]
    
    // Return first recommended action
    if (highestPriority.actions.length > 0) {
      return highestPriority.actions[0]
    }

    return null
  }
}
