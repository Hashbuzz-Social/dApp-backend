import dotenv from 'dotenv';
dotenv.config();

import RedisClient from '@services/redis-service';
import { logError, logInfo } from '@shared/helper';
import createPrismaClient from '@shared/prisma';
import { getConfig } from './appConfig';
import server from './server';

// Initialize BullMQ workers for scheduled jobs
import { AccountId } from '@hashgraph/sdk';
import './V201/SchedulesJobHandlers';

// Initialize V201 Events Worker for processing queued events
import './V201/EventsWorker';

let redisClient: RedisClient;
/**
 * Test Prisma connection
 */
async function testPrismaConnection() {
  try {
    const prisma = await createPrismaClient();
    await prisma.$connect();
    const msg = 'Connected to the database successfully.';
    logInfo(msg);
  } catch (error) {
    const errMsg = 'Failed to connect to the database';
    logError(errMsg, error);
    process.exit(1);
  }
}

/**
 * Test Redis connection
 */
async function testRedisConnection(client: RedisClient) {
  try {
    await client.checkConnection();
    const msg = 'Connected to Redis successfully.';
    logInfo(msg);
  } catch (error) {
    const errMsg = 'Failed to connect to Redis';
    logError(errMsg, error);
    process.exit(1);
  }
}

/**
 * Gracefully shuts down the server
 */
async function gracefulShutdown() {
  logInfo('Shutting down gracefully...');

  try {
    // Disconnect Prisma client and close connection pool
    const { disconnectPrisma } = await import('@shared/prisma');
    await disconnectPrisma();
    logInfo('Prisma disconnected and connection pool closed.');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logError(`Error disconnecting Prisma: ${errorMsg}`);
  }

  if (redisClient) {
    await redisClient.client.quit();
    logInfo('Redis disconnected.');
  }

  process.exit(0);
}

process.on('SIGTERM', () => {
  void gracefulShutdown();
});
process.on('SIGINT', () => {
  void gracefulShutdown();
});

/**
 * Initialize the server
 */
async function init() {
  try {
    logInfo('Initializing server');
    const config = await getConfig();
    redisClient = new RedisClient(config.db.redisServerURI);

    // CRITICAL: Set up admin addresses for authentication (from disabled setVariables)
    globalThis.adminAddress = String(config.app.adminAddresses)
      .split(',')
      .map((add: string) =>
        AccountId.fromString(add).toSolidityAddress().toString()
      );
    logInfo(
      `Admin addresses configured: ${globalThis.adminAddress.length} addresses`
    );

    // NOTE: Stuck campaigns and edge cases are handled through the event-based monitoring system.
    // Use the monitoring API endpoints:
    // - GET /api/v201/monitoring/campaigns/stuck - View stuck campaigns
    // - POST /api/v201/monitoring/campaigns/stuck/process - Process stuck campaigns
    // This ensures all campaign operations go through the proper event flow with idempotency guarantees.

    await testPrismaConnection();
    await testRedisConnection(redisClient);

    // ✅ Event Recovery: Recover orphaned events from previous server run
    // This ensures no event loss when server restarts with pending events in Redis queue
    try {
      const { EventRecoveryService } = await import(
        './V201/services/EventRecoveryService'
      );
      const recoveryResult = await EventRecoveryService.recoverPendingEvents();

      if (recoveryResult.recovered > 0) {
        logInfo(
          `🔄 Event Recovery: Recovered ${recoveryResult.recovered} orphaned events ` +
            `(${recoveryResult.failed} failed, ${recoveryResult.skipped} skipped)`
        );
      } else if (recoveryResult.total > 0) {
        logInfo(
          `⚠️  Event Recovery: Found ${recoveryResult.total} orphaned events ` +
            `but none recovered (${recoveryResult.failed} failed, ${recoveryResult.skipped} skipped)`
        );
      }

      // Schedule periodic cleanup of old events (every 6 hours)
      setInterval(() => {
        EventRecoveryService.cleanupOldEvents().catch((err) => {
          logError('Event cleanup failed', err);
        });
      }, 6 * 60 * 60 * 1000);

      logInfo('✅ Event recovery service initialized');
    } catch (recoveryError) {
      // Non-fatal: Log error but don't block server startup
      logError(
        'Event recovery service failed to initialize (non-fatal)',
        recoveryError
      );
    }

    // DEPRECATED: After-start jobs disabled for maintenance. These were used for:
    // - Checking previous campaign close times
    // - Processing backlog campaigns
    // await afterStartJobs();

    const port = config.app.port || 4000;
    const httpServer = server.listen(port, () => {
      const msg = `Server is running on http://localhost:${port}`;
      logInfo(msg);
    });

    // Attach WebSocket server (if available)
    try {
      // Lazy import to avoid circular deps
      const websocket = await import('./V201/websocket');
      if (websocket && websocket.attach) {
        websocket.attach(httpServer);
      }
    } catch (err) {
      logInfo('WebSocket module not attached: ' + String(err));
    }
  } catch (error) {
    const errMsg = 'Failed to initialize the server';
    logError(errMsg, error);
    process.exit(1);
  }
}

init().catch((error) => {
  const errMsg = 'Failed to initialize the server';
  logError(errMsg, error);
  process.exit(1);
});
