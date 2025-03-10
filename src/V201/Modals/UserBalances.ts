import { PrismaClient, Prisma } from '@prisma/client';

export type UpdateUserBalanceParams = {
  amount: number;
  operation: 'increment' | 'decrement' | 'update';
  token_id: number | bigint;
  user_id: number | bigint;
  decimal: number;
};

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

  /**
   * Updates the token balance for a user based on the specified operation.
   *
   * @param {Object} params - The parameters for updating the token balance.
   * @param {bigint} params.amount - The amount to update the balance by.
   * @param {'increment' | 'decrement' | 'update'} params.operation - The operation to perform on the balance.
   * @param {bigint} params.token_id - The ID of the token.
   * @param {bigint} params.user_id - The ID of the user.
   * @param {number} params.decimal - The decimal precision of the token.
   *
   * @returns {Promise<Prisma.user_balances>} The updated or created user balance record.
   *
   * @throws {Error} Throws an error if the operation fails.
   *
   * @example
   * // Increment the balance of a token for a user
   * const updatedBalance = await userBalancesModel.updateTokenBalanceForUser({
   *   amount: 100n,
   *   operation: 'increment',
   *   token_id: 1n,
   *   user_id: 1n,
   *   decimal: 18,
   * });
   *
   * @example
   * // Decrement the balance of a token for a user
   * const updatedBalance = await userBalancesModel.updateTokenBalanceForUser({
   *   amount: 50n,
   *   operation: 'decrement',
   *   token_id: 1n,
   *   user_id: 1n,
   *   decimal: 18,
   * });
   *
   * @example
   * // Update the balance of a token for a user to a specific amount
   * const updatedBalance = await userBalancesModel.updateTokenBalanceForUser({
   *   amount: 200n,
   *   operation: 'update',
   *   token_id: 1n,
   *   user_id: 1n,
   *   decimal: 18,
   * });
   */

  async updateTokenBalanceForUser({
    amount,
    operation,
    token_id,
    user_id,
    decimal,
  }: UpdateUserBalanceParams) {
    const balRecord = await this.prisma.user_balances.findFirst({
      where: { user_id, token_id },
    });

    if (!balRecord && ['increment', 'update'].includes(operation)) {
      return await this.prisma.user_balances.create({
        data: {
          user_id,
          entity_balance: amount,
          entity_decimal: parseInt(decimal.toString()),
          token_id,
        },
      });
    }

    if (
      ['increment', 'decrement'].includes(operation) &&
      balRecord &&
      balRecord.entity_balance
    ) {
      return await this.prisma.user_balances.update({
        data: {
          entity_balance: {
            [operation]: amount,
          },
        },
        where: {
          id: balRecord.id,
        },
      });
    }

    return await this.prisma.user_balances.update({
      where: {
        id: balRecord?.id,
      },
      data: {
        entity_balance: amount,
      },
    });
  }

  getUserBalanceModel() {
    return this.prisma.user_balances;
  }
}

export default UserBalancesModel;
