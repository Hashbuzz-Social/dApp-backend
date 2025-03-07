import { PrismaClient, Prisma } from '@prisma/client';

class UserBalancesModel {
    private prisma: PrismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prisma = prismaClient;
    }

    async getAllBalances() {
        try {
            return await this.prisma.user_balances.findMany();
        } catch (error) {
            console.error('Error fetching balances:', error);
            throw new Error('Could not fetch balances.');
        }
    }

    async getBalanceById(id: bigint) {
        try {
            return await this.prisma.user_balances.findUnique({
                where: { id },
            });
        } catch (error) {
            console.error('Error fetching balance by ID:', error);
            throw new Error('Could not fetch balance by ID.');
        }
    }

    async createBalance(data: Prisma.user_balancesCreateInput) {
        try {
            return await this.prisma.user_balances.create({
                data,
            });
        } catch (error) {
            console.error('Error creating balance:', error);
            throw new Error('Could not create balance.');
        }
    }

    async updateBalance(id: bigint, data: Prisma.user_balancesUpdateInput) {
        try {
            return await this.prisma.user_balances.update({
                where: { id },
                data,
            });
        } catch (error) {
            console.error('Error updating balance:', error);
            throw new Error('Could not update balance.');
        }
    }

    async deleteBalance(id: bigint | number) {
        try {
            return await this.prisma.user_balances.delete({
                where: { id },
            });
        } catch (error) {
            console.error('Error deleting balance:', error);
            throw new Error('Could not delete balance.');
        }
    }

    async getBalanceByUserId(userId: bigint) {
        try {
            return await this.prisma.user_balances.findMany({
                where: { user_id: userId },
            });
        } catch (error) {
            console.error('Error fetching balance by user ID:', error);
            throw new Error('Could not fetch balance by user ID.');
        }
    }

    getUserBalanceModel() {
        return this.prisma.user_balances;
    }
}

export default UserBalancesModel;