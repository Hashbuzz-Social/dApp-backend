/**
 * Log Configuration Helper
 * Sets up log rotation and configuration for Jet Logger
 */

import { logRotationService } from '../services/LogRotationService';

/**
 * Initialize log rotation system
 */
export function initializeLogRotation(): void {
  try {
    // Perform initial rotation check
    const shouldRotate = logRotationService.shouldRotate();
    if (shouldRotate) {
      process.stdout.write('Log rotation needed, rotating now...\n');
      logRotationService.rotate();
    }

    // Clean up old files
    logRotationService.cleanup();

    // Log the current state
    const stats = logRotationService.getLogStats();
    process.stdout.write(`Log rotation initialized: ${stats.totalFiles} files, ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB total\n`);
  } catch (error) {
    process.stderr.write(`Failed to initialize log rotation: ${String(error)}\n`);
  }
}

/**
 * Get log configuration summary
 */
export function getLogConfiguration() {
  return {
    maxLogSize: '10MB',
    maxLogFiles: 7,
    retentionDays: 7,
    logDirectory: 'logs/',
    rotationEnabled: true,
    currentStats: logRotationService.getLogStats()
  };
}
