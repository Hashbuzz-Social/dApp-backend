import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { getConfig } from '@appConfig';

// Singleton pattern to ensure only one Prisma client instance
let prismaInstance: PrismaClient | null = null;
let isInitializing = false;

const createPrismaClient = async (): Promise<PrismaClient> => {
    if (prismaInstance) {
        return prismaInstance!;
    }

    // Prevent multiple simultaneous initializations
    if (isInitializing) {
        while (isInitializing) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        // prismaInstance is guaranteed to be set or still null
        if (prismaInstance) return prismaInstance;
        throw new Error('Prisma client initialization failed.');
    }

    isInitializing = true;
    
    try {
        const configs = await getConfig();
        const pool = new Pool({ 
            connectionString: configs.db.dbServerURI,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
        
        const adapter = new PrismaPg(pool);
        prismaInstance = new PrismaClient({ adapter }).$extends({
            query: {
                $allModels: {
                    async $allOperations({ args, query }) {
                        try {
                            return await query(args);
                        } catch (error: any) {
                            console.error("Prisma error:", error);

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
        }) as PrismaClient;

        return prismaInstance;
    } finally {
        isInitializing = false;
    }
}

// Function to get the singleton instance
export const getPrismaClient = async (): Promise<PrismaClient> => {
    return await createPrismaClient();
};

// Export the creation function for backward compatibility
export default createPrismaClient;
