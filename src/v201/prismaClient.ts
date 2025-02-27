import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';
import { Pool } from 'pg';
import AppConfigManager from './appConfigManager';

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
                                    console.error("Prisma error:", error);

                                    if (error instanceof Prisma.PrismaClientKnownRequestError) {
                                        switch (error.code) {
                                            case 'P2002':
                                                throw new Error('A record with this value already exists. Duplicate values are not allowed.');
                                            case 'P2003':
                                                throw new Error('Operation failed due to a foreign key constraint.');
                                            case 'P2025':
                                                throw new Error('The requested record was not found.');
                                            default:
                                                throw new Error('An unexpected error occurred. Please try again later.');
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
