

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';
import { Pool } from 'pg';
import AppConfigManager from './appConfigManager';
import { AppConfig } from 'src/@types/AppConfig';

/**
 * @class PrismaClientManager
 * @description Singleton class to manage the PrismaClient instance with a PostgreSQL adapter.
 * This class ensures that only one instance of PrismaClient is created and reused throughout the application.
 * It also handles database connection errors and provides custom error messages for known Prisma errors.
 *
 * @example
 * // Usage example:
 * import PrismaClientManager from './prismaClientManager';
 *
 * async function main() {
 *     const prismaClient = await PrismaClientManager.getInstance();
 *     // Use prismaClient for database operations
 * }
 *
 * main().catch(console.error);
 *
 * @method getInstance
 * @static
 * @async
 * @returns {Promise<PrismaClient>} Returns a promise that resolves to the PrismaClient instance.
 *
 * @throws {Error} Throws an error if a database operation fails.
 *
 * @private
 * @static
 * @property {PrismaClient | null} instance - Holds the singleton instance of PrismaClient.
 * @property {Promise<PrismaClient> | null} instancePromise - Holds the promise that resolves to the PrismaClient instance.
 *
 * @event beforeExit - Listens for the 'beforeExit' event to disconnect the PrismaClient and end the PostgreSQL pool.
 */
class PrismaClientManager {
  private static instance: PrismaClient | null = null;
  private static instancePromise: Promise<PrismaClient> | null = null;

  private constructor() {}

  public static async getInstance(): Promise<PrismaClient> {
    if (PrismaClientManager.instance) {
      return PrismaClientManager.instance;
    }

    if (!PrismaClientManager.instancePromise) {
      PrismaClientManager.instancePromise = (async () => {
        const configs = await AppConfigManager.getConfig();
        const dbUri: string = configs.db.dbServerURI; // Ensure it's a string

        const pool = new Pool({ connectionString: dbUri });
        const adapter = new PrismaPg(pool);

        const client = new PrismaClient({ adapter }).$extends({
          query: {
            $allModels: {
              async $allOperations({ args, query }) {
                try {
                  return await query(args);
                } catch (error) {
                  console.error('Prisma error:', error);

                  if (error instanceof Prisma.PrismaClientKnownRequestError) {
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
                  throw new Error('Database operation failed.');
                }
              },
            },
          },
        }) as PrismaClient;

        PrismaClientManager.instance = client;

        // Handle cleanup on process exit
        process.on('beforeExit', async () => {
          await PrismaClientManager.instance?.$disconnect();
          await pool.end();
        });

        return client;
      })();
    }

    return PrismaClientManager.instancePromise;
  }
}

export default PrismaClientManager;
