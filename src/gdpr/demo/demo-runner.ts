/**
 * Demo Runner for GhostProtocol
 * Provides utilities to run demo scenarios and display results
 */

import { 
  allScenarios, 
  getScenarioById, 
  type DemoScenario 
} from './scenarios.js'
import { getDemoDataForScenario } from './index.js'

/**
 * Display a scenario in a formatted way
 */
export function displayScenario(scenario: DemoScenario) {
  console.log('\n' + '='.repeat(80))
  console.log(`SCENARIO: ${scenario.name}`)
  console.log('='.repeat(80))
  console.log(`\nID: ${scenario.id}`)
  console.log(`Duration: ${scenario.estimatedDuration}`)
  console.log(`\nDescription:\n${scenario.description}`)
  console.log(`\nUser: ${scenario.user.identifiers.userId}`)
  console.log(`  - Jurisdiction: ${scenario.user.jurisdiction}`)
  console.log(`  - Emails: ${scenario.user.identifiers.emails.join(', ')}`)
  console.log(`  - Phones: ${scenario.user.identifiers.phones.join(', ')}`)
  console.log(`\nExpected Outcome:\n${scenario.expectedOutcome}`)
  console.log(`\nDemonstrates:`)
  scenario.demonstratesFeatures.forEach(feature => {
    console.log(`  ✓ ${feature}`)
  })
  console.log(`\nSteps:`)
  scenario.steps.forEach(step => {
    console.log(`  ${step}`)
  })
  console.log('\n' + '='.repeat(80) + '\n')
}

/**
 * Display all available scenarios
 */
export function listAllScenarios() {
  console.log('\n' + '='.repeat(80))
  console.log('AVAILABLE DEMO SCENARIOS')
  console.log('='.repeat(80) + '\n')
  
  allScenarios.forEach((scenario, index) => {
    console.log(`${index + 1}. ${scenario.name}`)
    console.log(`   ID: ${scenario.id}`)
    console.log(`   Duration: ${scenario.estimatedDuration}`)
    console.log(`   User: ${scenario.user.identifiers.userId} (${scenario.user.jurisdiction})`)
    console.log(`   Features: ${scenario.demonstratesFeatures.length} demonstrated`)
    console.log('')
  })
  
  console.log('='.repeat(80) + '\n')
}

/**
 * Run a specific scenario (simulation)
 */
export async function runScenario(scenarioId: string) {
  const scenario = getScenarioById(scenarioId)
  
  if (!scenario) {
    console.error(`❌ Scenario not found: ${scenarioId}`)
    return
  }

  displayScenario(scenario)
  
  console.log('🚀 Starting scenario simulation...\n')
  
  // Get demo data for this scenario
  const demoData = getDemoDataForScenario(scenarioId)
  
  if (!demoData) {
    console.error('❌ No demo data available for this scenario')
    return
  }

  // Simulate each step with a delay
  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i]
    console.log(`\n[Step ${i + 1}/${scenario.steps.length}] ${step}`)
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Show progress indicator
    console.log('  ✓ Complete')
  }

  console.log('\n✅ Scenario completed successfully!')
  console.log(`\nExpected Outcome: ${scenario.expectedOutcome}`)
  console.log('\n' + '='.repeat(80) + '\n')
}

/**
 * Run the judge demo (60-second version)
 */
export async function runJudgeDemo() {
  console.log('\n' + '='.repeat(80))
  console.log('GHOSTPROTOCOL - 60 SECOND JUDGE DEMO')
  console.log('='.repeat(80) + '\n')

  const steps = [
    {
      title: 'Setup',
      duration: 5,
      description: 'GhostProtocol is a durable GDPR/CCPA erasure orchestration engine built on Motia.'
    },
    {
      title: 'Submit Erasure Request',
      duration: 10,
      description: 'Submitting request for Alice Johnson (EU user)...\n  - Workflow created with user lock\n  - Data lineage snapshot captured'
    },
    {
      title: 'Sequential Identity-Critical Deletion',
      duration: 15,
      description: 'Deleting identity-critical systems...\n  - Stripe deletion complete ✓\n  - Database deletion complete ✓\n  - "identity: GONE" checkpoint marked ✓'
    },
    {
      title: 'Parallel Non-Critical Deletion',
      duration: 10,
      description: 'Parallel deletion in progress...\n  - Intercom: Complete ✓\n  - SendGrid: Complete ✓\n  - CRM: Retrying... Complete ✓\n  - Analytics: Complete ✓'
    },
    {
      title: 'PII Agent in Action',
      duration: 10,
      description: 'Scanning chat exports for hidden PII...\n  - Found: alice.johnson@example.com (confidence: 0.92)\n  - Found: alice.j@personal.com (confidence: 0.85)\n  - Found: +1-555-0101 (confidence: 0.78)\n  - Automatic deletion spawned for high-confidence matches ✓'
    },
    {
      title: 'Certificate Generation',
      duration: 5,
      description: 'Generating Certificate of Destruction...\n  - All system receipts included ✓\n  - Signed hash chain: 8f3a2b... ✓\n  - Data lineage snapshot attached ✓\n  - Legal compliance proof ready ✓'
    },
    {
      title: 'Closing',
      duration: 5,
      description: 'The workflow survives crashes, handles zombie data, and provides legally defensible proof of deletion.'
    }
  ]

  let totalTime = 0

  for (const step of steps) {
    console.log(`\n[${totalTime}s] ${step.title} (${step.duration}s)`)
    console.log('-'.repeat(80))
    console.log(step.description)
    
    await new Promise(resolve => setTimeout(resolve, step.duration * 100)) // Faster for demo
    totalTime += step.duration
  }

  console.log('\n' + '='.repeat(80))
  console.log(`✅ Demo completed in ${totalTime} seconds`)
  console.log('='.repeat(80) + '\n')
}

/**
 * Interactive demo menu
 */
export async function interactiveDemoMenu() {
  console.log('\n' + '='.repeat(80))
  console.log('GHOSTPROTOCOL DEMO SYSTEM')
  console.log('='.repeat(80) + '\n')

  console.log('Available Commands:')
  console.log('  1. List all scenarios')
  console.log('  2. Run judge demo (60 seconds)')
  console.log('  3. Run specific scenario')
  console.log('  4. Show scenario details')
  console.log('  5. Exit')
  console.log('\n' + '='.repeat(80) + '\n')

  // In a real implementation, this would use readline or inquirer
  // For now, just show the menu structure
  console.log('💡 Tip: Import and call specific functions from demo-runner.ts')
  console.log('   Example: runJudgeDemo(), listAllScenarios(), runScenario("scenario_1")')
}

/**
 * Generate a demo report
 */
export function generateDemoReport() {
  const report = {
    totalScenarios: allScenarios.length,
    totalDuration: allScenarios.reduce((sum, s) => {
      const minutes = parseInt(s.estimatedDuration)
      return sum + (isNaN(minutes) ? 0 : minutes)
    }, 0),
    scenariosByDuration: allScenarios.map(s => ({
      id: s.id,
      name: s.name,
      duration: s.estimatedDuration,
      features: s.demonstratesFeatures.length
    })),
    featureCoverage: {} as Record<string, number>
  }

  // Count feature coverage
  allScenarios.forEach(scenario => {
    scenario.demonstratesFeatures.forEach(feature => {
      const key = feature.toLowerCase()
      report.featureCoverage[key] = (report.featureCoverage[key] || 0) + 1
    })
  })

  return report
}

/**
 * Print demo report
 */
export function printDemoReport() {
  const report = generateDemoReport()

  console.log('\n' + '='.repeat(80))
  console.log('DEMO SYSTEM REPORT')
  console.log('='.repeat(80) + '\n')

  console.log(`Total Scenarios: ${report.totalScenarios}`)
  console.log(`Total Duration: ~${report.totalDuration} seconds\n`)

  console.log('Scenarios by Duration:')
  report.scenariosByDuration.forEach(s => {
    console.log(`  - ${s.name}: ${s.duration} (${s.features} features)`)
  })

  console.log('\nFeature Coverage:')
  Object.entries(report.featureCoverage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([feature, count]) => {
      console.log(`  - ${feature}: ${count} scenario(s)`)
    })

  console.log('\n' + '='.repeat(80) + '\n')
}

// CLI support
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2]

  switch (command) {
    case 'list':
      listAllScenarios()
      break
    case 'judge':
      await runJudgeDemo()
      break
    case 'run':
      const scenarioId = process.argv[3]
      if (scenarioId) {
        await runScenario(scenarioId)
      } else {
        console.error('Usage: demo-runner.ts run <scenario_id>')
      }
      break
    case 'report':
      printDemoReport()
      break
    case 'menu':
      await interactiveDemoMenu()
      break
    default:
      console.log('Usage: demo-runner.ts <command>')
      console.log('Commands: list, judge, run <scenario_id>, report, menu')
  }
}
