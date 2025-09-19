#!/usr/bin/env ts-node

import { HederaConsensusService } from './src/services/hedera-consensus-service';
import logger from 'jet-logger';

async function testHCSInit() {
  try {
    logger.info('Testing HCS service initialization...');

    const hcs = new HederaConsensusService();
    await hcs.init();

    logger.info('✓ HCS service initialized successfully');

    const topics = hcs.getAvailableTopics();
    logger.info(`✓ Available topics: ${JSON.stringify(topics, null, 2)}`);

    // Test topic creation
    logger.info('Testing automatic topic creation...');
    await hcs.initializeDefaultTopics();

    logger.info('✓ Default topics initialized successfully');

    process.exit(0);
  } catch (error) {
    logger.err(`✗ HCS initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      logger.err(error.stack);
    }
    process.exit(1);
  }
}

testHCSInit();
