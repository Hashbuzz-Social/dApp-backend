#!/usr/bin/env node

/**
 * Log Rotation Test Script
 * Tests the log rotation configuration and functionality
 */

import path from 'path';
import { logRotationService } from '../src/services/LogRotationService';

async function testLogRotation() {
  console.log('🔄 Testing Log Rotation Configuration...\n');

  try {
    // Get current log statistics
    const stats = logRotationService.getLogStats();
    console.log('📊 Current Log Statistics:');
    console.log(`   Total Files: ${stats.totalFiles}`);
    console.log(`   Total Size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('   Files:');
    stats.files.forEach(file => {
      console.log(`     - ${file.name}: ${(file.size / 1024).toFixed(2)} KB (${file.modified.toISOString()})`);
    });

    // Check if rotation is needed
    const shouldRotate = logRotationService.shouldRotate();
    console.log(`\n🔄 Rotation needed: ${shouldRotate ? 'Yes' : 'No'}`);

    // Test rotation if needed
    if (shouldRotate) {
      console.log('\n🔄 Performing log rotation...');
      const rotated = logRotationService.rotate();
      console.log(`   Rotation result: ${rotated ? 'Success' : 'Failed'}`);

      // Get updated stats
      const newStats = logRotationService.getLogStats();
      console.log('\n📊 Updated Log Statistics:');
      console.log(`   Total Files: ${newStats.totalFiles}`);
      console.log(`   Total Size: ${(newStats.totalSize / 1024 / 1024).toFixed(2)} MB`);
    }

    // Cleanup old files
    console.log('\n🧹 Cleaning up old log files...');
    logRotationService.cleanup();

    console.log('\n✅ Log rotation test completed successfully!');
  } catch (error) {
    console.error('❌ Log rotation test failed:', error);
    process.exit(1);
  }
}

// Run the test
testLogRotation();
