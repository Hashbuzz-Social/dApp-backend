#!/usr/bin/env ts-node

/**
 * Database Backup and Restore Utility for V201 Testing
 *
 * This utility ensures no production data is lost during testing by:
 * 1. Creating backups before tests
 * 2. Validating database state
 * 3. Providing restore capabilities
 * 4. Preventing accidental production data loss
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import logger from 'jet-logger';
import { PrismaClient } from '@prisma/client';

const execAsync = promisify(exec);

interface DatabaseInfo {
  environment: 'production' | 'development' | 'test' | 'unknown';
  host: string;
  database: string;
  recordCounts: {
    campaigns: number;
    engagements: number;
    users: number;
  };
  estimatedValue: 'high' | 'medium' | 'low';
}

class DatabaseSafetyManager {
  private prisma = new PrismaClient();
  private backupDir = path.join(process.cwd(), 'test-backups');

  /**
   * Analyze current database to determine if it contains production data
   */
  async analyzeDatabase(): Promise<DatabaseInfo> {
    try {
      const prisma = this.prisma;

      // Get record counts
      const [campaignCount, engagementCount, userCount] = await Promise.all([
        prisma.campaign_twittercard.count(),
        prisma.campaign_tweetengagements.count(),
        prisma.user_user.count(),
      ]);

      // Determine environment based on DATABASE_URL
      const databaseUrl = process.env.DATABASE_URL || '';
      let environment: DatabaseInfo['environment'] = 'unknown';

      if (
        databaseUrl.includes('localhost') ||
        databaseUrl.includes('127.0.0.1')
      ) {
        environment = 'development';
      } else if (databaseUrl.includes('test')) {
        environment = 'test';
      } else if (
        databaseUrl.includes('prod') ||
        databaseUrl.includes('aws') ||
        databaseUrl.includes('cloud')
      ) {
        environment = 'production';
      }

      // Extract database connection info
      const urlParts = databaseUrl.match(
        /(?:postgres|mysql):\/\/[^@]+@([^:]+).*\/([^?]+)/
      );
      const host = urlParts?.[1] || 'unknown';
      const database = urlParts?.[2] || 'unknown';

      // Estimate data value based on record counts
      let estimatedValue: DatabaseInfo['estimatedValue'] = 'low';
      if (campaignCount > 100 || engagementCount > 1000 || userCount > 50) {
        estimatedValue = 'high';
      } else if (
        campaignCount > 10 ||
        engagementCount > 100 ||
        userCount > 10
      ) {
        estimatedValue = 'medium';
      }

      return {
        environment,
        host,
        database,
        recordCounts: {
          campaigns: campaignCount,
          engagements: engagementCount,
          users: userCount,
        },
        estimatedValue,
      };
    } catch (error) {
      throw new Error(
        `Failed to analyze database: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Create a backup before running tests
   */
  async createBackup(testName: string): Promise<string> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(
        this.backupDir,
        `${testName}_${timestamp}.sql`
      );

      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL environment variable not set');
      }

      // Extract connection details from DATABASE_URL
      const urlMatch = databaseUrl.match(
        /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/
      );
      if (!urlMatch) {
        throw new Error('Invalid DATABASE_URL format');
      }

      const [, username, password, host, port, database] = urlMatch;

      // Create PostgreSQL backup using pg_dump
      const pgDumpCommand = `PGPASSWORD="${password}" pg_dump -h ${host} -p ${port} -U ${username} -d ${database} -f "${backupFile}" --verbose`;

      logger.info(`Creating backup: ${backupFile}`);
      await execAsync(pgDumpCommand);

      // Verify backup file was created and has content
      const stats = await fs.stat(backupFile);
      if (stats.size < 1000) {
        throw new Error('Backup file appears to be empty or too small');
      }

      logger.info(
        `✅ Backup created successfully: ${backupFile} (${Math.round(
          stats.size / 1024
        )}KB)`
      );
      return backupFile;
    } catch (error) {
      throw new Error(
        `Failed to create backup: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Restore database from backup
   */
  async restoreBackup(backupFile: string): Promise<void> {
    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL environment variable not set');
      }

      // Check if backup file exists
      await fs.access(backupFile);

      const urlMatch = databaseUrl.match(
        /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/
      );
      if (!urlMatch) {
        throw new Error('Invalid DATABASE_URL format');
      }

      const [, username, password, host, port, database] = urlMatch;

      logger.info(`Restoring database from backup: ${backupFile}`);

      // Drop all tables and restore
      const psqlCommand = `PGPASSWORD="${password}" psql -h ${host} -p ${port} -U ${username} -d ${database} -f "${backupFile}"`;

      await execAsync(psqlCommand);
      logger.info('✅ Database restored successfully');
    } catch (error) {
      throw new Error(
        `Failed to restore backup: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Safety check before running potentially destructive operations
   */
  async performSafetyCheck(
    testName: string,
    force = false
  ): Promise<{ proceed: boolean; backupFile?: string }> {
    try {
      const dbInfo = await this.analyzeDatabase();

      logger.info('🔍 Database Safety Analysis:');
      logger.info(`   Environment: ${dbInfo.environment}`);
      logger.info(`   Host: ${dbInfo.host}`);
      logger.info(`   Database: ${dbInfo.database}`);
      logger.info(`   Campaigns: ${dbInfo.recordCounts.campaigns}`);
      logger.info(`   Engagements: ${dbInfo.recordCounts.engagements}`);
      logger.info(`   Users: ${dbInfo.recordCounts.users}`);
      logger.info(`   Estimated Value: ${dbInfo.estimatedValue}`);

      // CRITICAL: Prevent running tests on production data
      if (dbInfo.environment === 'production' && !force) {
        logger.err('🚨 CRITICAL: Cannot run tests on PRODUCTION database!');
        logger.err('   Use --test-db flag to run against test database');
        logger.err(
          '   Or use --force flag if you absolutely must (NOT recommended)'
        );
        return { proceed: false };
      }

      // HIGH VALUE DATA WARNING
      if (dbInfo.estimatedValue === 'high' && !force) {
        logger.warn('⚠️  WARNING: Database contains significant data:');
        logger.warn(
          `   ${dbInfo.recordCounts.campaigns} campaigns, ${dbInfo.recordCounts.engagements} engagements`
        );
        logger.warn('   Creating backup before proceeding...');

        const backupFile = await this.createBackup(testName);
        logger.info('✅ Backup completed. Tests can proceed safely.');

        return { proceed: true, backupFile };
      }

      // MEDIUM VALUE DATA - create backup but proceed
      if (dbInfo.estimatedValue === 'medium') {
        logger.info('📦 Creating backup for medium-value data...');
        const backupFile = await this.createBackup(testName);
        return { proceed: true, backupFile };
      }

      // LOW VALUE DATA - proceed without backup
      logger.info(
        '✅ Low-value test data detected. Proceeding without backup.'
      );
      return { proceed: true };
    } catch (error) {
      logger.err(
        `Safety check failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return { proceed: false };
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<string[]> {
    try {
      await fs.access(this.backupDir);
      const files = await fs.readdir(this.backupDir);
      return files
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .reverse();
    } catch (error) {
      return [];
    }
  }

  /**
   * Clean up old backups (keep last 10)
   */
  async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();
      const backupsToDelete = backups.slice(10); // Keep last 10

      for (const backup of backupsToDelete) {
        const backupPath = path.join(this.backupDir, backup);
        await fs.unlink(backupPath);
        logger.info(`Cleaned up old backup: ${backup}`);
      }
    } catch (error) {
      logger.warn(
        `Failed to cleanup old backups: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async close(): Promise<void> {
    try {
      const prisma = this.prisma;
      await prisma.$disconnect();
    } catch (error) {
      logger.warn(
        `Error disconnecting from database: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

export default DatabaseSafetyManager;

// CLI Usage
async function main() {
  if (require.main === module) {
    const action = process.argv[2];
    const dbSafety = new DatabaseSafetyManager();

    try {
      switch (action) {
        case 'analyze':
          const info = await dbSafety.analyzeDatabase();
          console.log(JSON.stringify(info, null, 2));
          break;

        case 'backup':
          const testName = process.argv[3] || 'manual';
          const backupFile = await dbSafety.createBackup(testName);
          console.log(`Backup created: ${backupFile}`);
          break;

        case 'restore':
          const restoreFile = process.argv[3];
          if (!restoreFile) {
            console.error('Please specify backup file to restore');
            process.exit(1);
          }
          await dbSafety.restoreBackup(restoreFile);
          break;

        case 'list':
          const backups = await dbSafety.listBackups();
          console.log('Available backups:');
          backups.forEach(backup => console.log(`  ${backup}`));
          break;

        case 'safety-check':
          const testNameForCheck = process.argv[3] || 'test';
          const force = process.argv.includes('--force');
          const result = await dbSafety.performSafetyCheck(testNameForCheck, force);
          console.log(`Safety check result: ${result.proceed ? 'PROCEED' : 'STOP'}`);
          if (result.backupFile) {
            console.log(`Backup created: ${result.backupFile}`);
          }
          break;

        default:
          console.log('Usage: npx ts-node databaseSafetyManager.ts [analyze|backup|restore|list|safety-check] [options]');
          console.log('Examples:');
          console.log('  npx ts-node databaseSafetyManager.ts analyze');
          console.log('  npx ts-node databaseSafetyManager.ts backup audit-test');
          console.log('  npx ts-node databaseSafetyManager.ts restore backup_file.sql');
          console.log('  npx ts-node databaseSafetyManager.ts safety-check audit-test');
      }
    } finally {
      await dbSafety.close();
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}
