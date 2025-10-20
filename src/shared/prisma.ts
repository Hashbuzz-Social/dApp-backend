import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { getConfig } from '@appConfig';
import Logger from 'jet-logger';

// Singleton instances
let globalPrismaClient: PrismaClient | null = null;
let globalPool: Pool | null = null;

/**
 * Create or reuse a Prisma client with connection pooling
 * This prevents "too many clients" errors by reusing the same pool
 */
const createPrismaClient = async (): Promise<PrismaClient> => {
  // Return existing client if already initialized
  if (globalPrismaClient && globalPool) {
    return globalPrismaClient;
  }

  try {
    const configs = await getConfig();

    // Create a single connection pool (reused across all Prisma clients)
    if (!globalPool) {
      globalPool = new Pool({
        connectionString: configs.db.dbServerURI,
        // Connection pool configuration
        max: 20, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection cannot be established
        allowExitOnIdle: false, // Keep the pool alive even when idle
      });

      // Log pool events for debugging
      globalPool.on('error', (err) => {
        Logger.err(`Unexpected database pool error: ${err.message}`);
      });

      globalPool.on('connect', () => {
        Logger.info('New database connection established in pool');
      });

      Logger.info(
        `Database connection pool initialized (max connections: ${globalPool.options.max})`
      );
    }

    const adapter = new PrismaPg(globalPool);
    const prisma = new PrismaClient({ adapter }).$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            try {
              return await query(args);
            } catch (error) {
              Logger.err(`Prisma error: ${String(error)}`);

              switch (error.code) {
                case 'P2002':
                  throw new Error(
                    'A record with this value already exists. Duplicate values are not allowed.'
                  );
                case 'P2003':
                  throw new Error(
                    'Operation failed due to a foreign key constraint.'
                  );
                case 'P2025':
                  throw new Error('The requested record was not found.');
                default:
                  throw new Error(
                    'An unexpected error occurred. Please try again later.'
                  );
              }
            }
          },
        },
      },
    }) as unknown as PrismaClient;

    // Store the client globally for reuse
    globalPrismaClient = prisma;

    Logger.info('Prisma client initialized and cached for reuse');

    return prisma;
  } catch (error) {
    Logger.err(
      `Failed to create Prisma client: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
};

/**
 * Gracefully disconnect the Prisma client and close the pool
 * Call this during application shutdown
 */
export const disconnectPrisma = async (): Promise<void> => {
  try {
    if (globalPrismaClient) {
      await globalPrismaClient.$disconnect();
      Logger.info('Prisma client disconnected');
      globalPrismaClient = null;
    }

    if (globalPool) {
      await globalPool.end();
      Logger.info('Database connection pool closed');
      globalPool = null;
    }
  } catch (error) {
    Logger.err(
      `Error disconnecting Prisma: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

/**
 * Get connection pool statistics for monitoring
 */
export const getPoolStats = (): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
} | null => {
  if (!globalPool) {
    return null;
  }

  return {
    totalCount: globalPool.totalCount,
    idleCount: globalPool.idleCount,
    waitingCount: globalPool.waitingCount,
  };
};

export default createPrismaClient;
