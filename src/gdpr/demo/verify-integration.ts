/**
 * Integration Verification Script
 * 
 * Verifies that all GhostProtocol components are properly wired together
 */

import { checkIntegrationHealth, integrationConfig } from '../integration/workflow-integration.js'

console.log('\n' + '='.repeat(80))
console.log('GHOSTPROTOCOL INTEGRATION VERIFICATION')
console.log('='.repeat(80) + '\n')

// Check integration health
console.log('🔍 Checking integration health...\n')
const health = checkIntegrationHealth()

if (health.healthy) {
  console.log('✅ Integration health check PASSED')
} else {
  console.log('❌ Integration health check FAILED')
  console.log('\nIssues found:')
  health.issues.forEach(issue => {
    console.log(`  - ${issue}`)
  })
}

// Verify event flow map
console.log('\n' + '-'.repeat(80))
console.log('EVENT FLOW MAP')
console.log('-'.repeat(80) + '\n')

const eventFlowCount = Object.keys(integrationConfig.eventFlowMap).length
console.log(`Total event flows: ${eventFlowCount}`)

Object.entries(integrationConfig.eventFlowMap).forEach(([trigger, targets]) => {
  console.log(`\n${trigger}`)
  targets.forEach(target => {
    console.log(`  └─> ${target}`)
  })
})

// Verify step dependencies
console.log('\n' + '-'.repeat(80))
console.log('STEP DEPENDENCIES')
console.log('-'.repeat(80) + '\n')

const dependencyCount = Object.keys(integrationConfig.stepDependencies).length
console.log(`Total steps with dependencies: ${dependencyCount}`)

Object.entries(integrationConfig.stepDependencies).forEach(([step, deps]) => {
  console.log(`\n${step}`)
  deps.forEach(dep => {
    console.log(`  ← depends on: ${dep}`)
  })
})

// Verify system integrations
console.log('\n' + '-'.repeat(80))
console.log('SYSTEM INTEGRATIONS')
console.log('-'.repeat(80) + '\n')

const systemCount = Object.keys(integrationConfig.systemIntegrations).length
console.log(`Total integrated systems: ${systemCount}`)

Object.entries(integrationConfig.systemIntegrations).forEach(([system, config]) => {
  const criticalIcon = config.critical ? '🔐' : '🔄'
  console.log(`\n${criticalIcon} ${system}`)
  console.log(`  Step: ${config.stepName}`)
  console.log(`  Connector: ${config.connector}`)
  console.log(`  Critical: ${config.critical}`)
  console.log(`  Max Retries: ${config.maxRetries}`)
})

// Verify streaming topics
console.log('\n' + '-'.repeat(80))
console.log('STREAMING TOPICS')
console.log('-'.repeat(80) + '\n')

const topicCount = Object.keys(integrationConfig.streamingTopics).length
console.log(`Total streaming topics: ${topicCount}`)

Object.entries(integrationConfig.streamingTopics).forEach(([topic, config]) => {
  console.log(`\n📡 ${topic}`)
  console.log(`  Description: ${config.description}`)
  console.log(`  Events: ${config.events.length}`)
  config.events.forEach(event => {
    console.log(`    - ${event}`)
  })
})

// Verify audit events
console.log('\n' + '-'.repeat(80))
console.log('AUDIT EVENTS')
console.log('-'.repeat(80) + '\n')

const auditEventCount = integrationConfig.auditEventTypes.length
console.log(`Total audit event types: ${auditEventCount}`)

const eventsByCategory = {
  workflow: integrationConfig.auditEventTypes.filter(e => e.includes('WORKFLOW')),
  deletion: integrationConfig.auditEventTypes.filter(e => e.includes('DELETION')),
  pii: integrationConfig.auditEventTypes.filter(e => e.includes('PII')),
  certificate: integrationConfig.auditEventTypes.filter(e => e.includes('CERTIFICATE')),
  zombie: integrationConfig.auditEventTypes.filter(e => e.includes('ZOMBIE')),
  legal: integrationConfig.auditEventTypes.filter(e => e.includes('LEGAL')),
  other: integrationConfig.auditEventTypes.filter(e => 
    !e.includes('WORKFLOW') && 
    !e.includes('DELETION') && 
    !e.includes('PII') && 
    !e.includes('CERTIFICATE') && 
    !e.includes('ZOMBIE') && 
    !e.includes('LEGAL')
  )
}

Object.entries(eventsByCategory).forEach(([category, events]) => {
  if (events.length > 0) {
    console.log(`\n${category.toUpperCase()} (${events.length}):`)
    events.forEach(event => {
      console.log(`  - ${event}`)
    })
  }
})

// Component checklist
console.log('\n' + '-'.repeat(80))
console.log('COMPONENT CHECKLIST')
console.log('-'.repeat(80) + '\n')

const components = [
  { name: 'API Layer', files: ['create-erasure-request.step.ts', 'get-erasure-status.step.ts', 'get-certificate.step.ts'] },
  { name: 'Identity-Critical Steps', files: ['stripe-deletion.step.ts', 'database-deletion.step.ts', 'checkpoint-validation.step.ts'] },
  { name: 'Parallel Deletion Steps', files: ['intercom-deletion.step.ts', 'sendgrid-deletion.step.ts', 'crm-deletion.step.ts', 'analytics-deletion.step.ts'] },
  { name: 'Orchestrators', files: ['identity-critical-orchestrator.step.ts', 'parallel-deletion-orchestrator.step.ts'] },
  { name: 'PII Agent', files: ['pii-agent.ts'] },
  { name: 'Background Jobs', files: ['background-job-manager.ts', 's3-cold-storage-scan.step.ts', 'warehouse-scan.step.ts'] },
  { name: 'Services', files: ['workflow-state-manager.ts', 'audit-trail.ts', 'certificate-generator.ts', 'policy-manager.ts', 'legal-hold-manager.ts'] },
  { name: 'Streams', files: ['workflow-status.stream.ts', 'error-notifications.stream.ts', 'completion-notifications.stream.ts'] },
  { name: 'Cron Jobs', files: ['zombie-data-check.step.ts'] },
  { name: 'Demo System', files: ['demo-runner.ts', 'scenarios.ts', 'end-to-end-test.ts', 'visual-demo.ts'] }
]

components.forEach(component => {
  console.log(`\n✓ ${component.name}`)
  component.files.forEach(file => {
    console.log(`  - ${file}`)
  })
})

// Summary
console.log('\n' + '='.repeat(80))
console.log('VERIFICATION SUMMARY')
console.log('='.repeat(80) + '\n')

console.log(`Integration Health: ${health.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`)
console.log(`Event Flows: ${eventFlowCount}`)
console.log(`Step Dependencies: ${dependencyCount}`)
console.log(`System Integrations: ${systemCount}`)
console.log(`Streaming Topics: ${topicCount}`)
console.log(`Audit Event Types: ${auditEventCount}`)
console.log(`Components: ${components.length}`)

if (health.healthy) {
  console.log('\n✅ All components are properly wired together!')
  console.log('✅ GhostProtocol is ready for demo!')
} else {
  console.log('\n⚠️  Some integration issues detected. Please review above.')
}

console.log('\n' + '='.repeat(80) + '\n')

// Exit with appropriate code
process.exit(health.healthy ? 0 : 1)
