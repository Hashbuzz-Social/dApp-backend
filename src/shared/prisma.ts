import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient().$extends({
    query: {
        $allModels: {
            async $allOperations({ model, operation, args, query }) {
                try {
                    const result = await query(args);
                    return result;
                } catch (error) {
                    console.error("Prisma error:", error);

                    // Handle specific error codes
                    if (error.code === 'P2002') {
                        // Unique constraint failed
                        throw new Error('A record with this value already exists. Duplicate values are not allowed.');
                    } else if (error.code === 'P2003') {
                        // Foreign key constraint failed
                        throw new Error('Operation failed due to a foreign key constraint.');
                    } else if (error.code === 'P2025') {
                        // Record not found
                        throw new Error('The requested record was not found.');
                    } else {
                        // General error
                        throw new Error('An unexpected error occurred. Please try again later.');
                    }
                }
            },
        },
    },
});

export default prisma;