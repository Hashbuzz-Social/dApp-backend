#!/usr/bin/env ts-node

/**
 * V201 Campaign Lifecycle Test Executor
 *
 * Run this file to execute comprehensive end-to-end tests for the V201 campaign flow.
 *
 * Usage:
 * npm run test:v201-lifecycle
 * OR
 * npx ts-node src/V201/tests/integration/runV201Tests.ts
 */

import { V201CampaignLifecycleTestRunner } from './V201BDDTestRunner';
import logger from 'jet-logger';

async function main() {
  try {
    logger.info('🚀 Starting V201 Campaign Lifecycle Integration Tests');
    logger.info('');

    const testRunner = new V201CampaignLifecycleTestRunner();
    const results = await testRunner.runAllScenarios();

    // Exit with appropriate code
    const allPassed = results.every((r: any) => r.passed);
    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    logger.err(`❌ Test execution failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Execute if this file is run directly
if (require.main === module) {
  main();
}

export { main as runV201LifecycleTests };
