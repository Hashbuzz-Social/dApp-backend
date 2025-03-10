import { PrismaClient, Prisma, user_user } from '@prisma/client';

class UsersModel {
    private prisma: PrismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prisma = prismaClient;
    }

    async getAllUsers() {
        try {
            return await this.prisma.user_user.findMany();
        } catch (error) {
            console.error('Error fetching users:', error);
            throw new Error('Could not fetch users.');
        }
    }

    async getUserById(id: bigint) {
        try {
            return await this.prisma.user_user.findUnique({
                where: { id },
            });
        } catch (error) {
            console.error('Error fetching user by ID:', error);
            throw new Error('Could not fetch user by ID.');
        }
    }

    async createUser(data: Prisma.user_userCreateInput) {
        try {
            return await this.prisma.user_user.create({
                data,
            });
        } catch (error) {
            console.error('Error creating user:', error);
            throw new Error('Could not create user.');
        }
    }

    async updateUser(id: bigint, data: Prisma.user_userUpdateInput) {
        try {
            return await this.prisma.user_user.update({
                where: { id },
                data,
            });
        } catch (error) {
            console.error('Error updating user:', error);
            throw new Error('Could not update user.');
        }
    }

    async deleteUser(id: bigint | number) {
        try {
            return await this.prisma.user_user.delete({
                where: { id },
            });
        } catch (error) {
            console.error('Error deleting user:', error);
            throw new Error('Could not delete user.');
        }
    }

    async getUserByAccountAddress(accountAddress: string) {
        try {
            return await this.prisma.user_user.findUnique({
                where: { accountAddress },
            });
        } catch (error) {
            console.error('Error fetching user by account address:', error);
            throw new Error('Could not fetch user by account address.');
        }
    }

    async updateUserBalance(id: number | bigint, amount: number, operation: "increment" | "decrement" | "update"): Promise<user_user> {
        try {
            const data = operation === "increment" ? { available_budget: { increment: amount } }
                        : operation === "decrement" ? { available_budget: { decrement: amount } }
                        : { available_budget: amount };

            return await this.prisma.user_user.update({
                where: { id },
                data,
            });
        } catch (error) {
            console.error('Error updating user balance:', error);
            throw new Error('Could not update user balance.');
        }
    }
    

    getUserModel() {
        return this.prisma.user_user;
    }
}

export default UsersModel;