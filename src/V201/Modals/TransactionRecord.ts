import { PrismaClient, Prisma } from '@prisma/client';

class TransactionRecordModel {
    private prisma: PrismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prisma = prismaClient;
    }

    async getAllTransactions() {
        try {
            return await this.prisma.transactions.findMany();
        } catch (error) {
            console.error('Error fetching transactions:', error);
            throw new Error('Could not fetch transactions.');
        }
    }

    async getTransactionById(id: bigint) {
        try {
            return await this.prisma.transactions.findUnique({
                where: { id },
            });
        } catch (error) {
            console.error('Error fetching transaction by ID:', error);
            throw new Error('Could not fetch transaction by ID.');
        }
    }

    async createTransaction(data: Prisma.transactionsCreateInput) {
        try {
            return await this.prisma.transactions.create({
                data,
            });
        } catch (error) {
            console.error('Error creating transaction:', error);
            throw new Error('Could not create transaction.');
        }
    }

    async updateTransaction(id: bigint, data: any) {
        try {
            return await this.prisma.transactions.update({
                where: { id },
                data,
            });
        } catch (error) {
            console.error('Error updating transaction:', error);
            throw new Error('Could not update transaction.');
        }
    }

    async deleteTransaction(id: bigint | number) {
        try {
            return await this.prisma.transactions.delete({
                where: { id },
            });
        } catch (error) {
            console.error('Error deleting transaction:', error);
            throw new Error('Could not delete transaction.');
        }
    }

    async upsertTransaction(
        data: Prisma.transactionsCreateInput,
        transactionId?: string
    ) {
        try {
            return await this.prisma.transactions.upsert({
                where: { transaction_id: transactionId },
                update: data,
                create: data,
            });
        } catch (error) {
            console.error('Error upserting transaction:', error);
            throw new Error('Could not upsert transaction.');
        }
    }

    async getTransactionDataById(transactionId: string) {
        try {
            return await this.prisma.transactions.findUnique({
                where: { transaction_id: transactionId },
            });
        } catch (error) {
            console.error('Error fetching transaction by ID:', error);
            throw new Error('Could not fetch transaction by ID.');
        }
    }

    getTransactionModel() {
        return this.prisma.transactions;
    }
}

export default TransactionRecordModel;