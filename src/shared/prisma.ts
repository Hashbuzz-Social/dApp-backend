import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { getConfig } from '@appConfig';
import Logger from 'jet-logger';

const createPrismaClient = async (): Promise<PrismaClient> => {
    const configs = await getConfig();
    const pool = new Pool({ connectionString: configs.db.dbServerURI });
    const adapter = new PrismaPg(pool);
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
                                throw new Error('A record with this value already exists. Duplicate values are not allowed.');
                            case 'P2003':
                                throw new Error('Operation failed due to a foreign key constraint.');
                            case 'P2025':
                                throw new Error('The requested record was not found.');
                            default:
                                throw new Error('An unexpected error occurred. Please try again later.');
                        }
                    }
                },
            },
        },
    }) as unknown as PrismaClient;

    return prisma;
}

export default createPrismaClient;
