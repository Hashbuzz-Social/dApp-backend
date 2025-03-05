import { PrismaClient, Prisma } from '@prisma/client';

class WhiteListedTokensModel {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  async getAllTokens() {
    try {
      return await this.prisma.whiteListedTokens.findMany();
    } catch (error) {
      console.error('Error fetching tokens:', error);
      throw new Error('Could not fetch tokens.');
    }
  }

  async getTokenById(id: bigint) {
    try {
      return await this.prisma.whiteListedTokens.findUnique({
        where: { id },
      });
    } catch (error) {
      console.error('Error fetching token by ID:', error);
      throw new Error('Could not fetch token by ID.');
    }
  }

  async createToken(data: Prisma.whiteListedTokensCreateInput) {
    try {
      return await this.prisma.whiteListedTokens.create({
        data,
      });
    } catch (error) {
      console.error('Error creating token:', error);
      throw new Error('Could not create token.');
    }
  }

  async updateToken(id: bigint, data: any) {
    try {
      return await this.prisma.whiteListedTokens.update({
        where: { id },
        data,
      });
    } catch (error) {
      console.error('Error updating token:', error);
      throw new Error('Could not update token.');
    }
  }

  async deleteToken(id: bigint | number) {
    try {
      return await this.prisma.whiteListedTokens.delete({
        where: { id },
      });
    } catch (error) {
      console.error('Error deleting token:', error);
      throw new Error('Could not delete token.');
    }
  }

  async upsertToken(
    data: Prisma.whiteListedTokensCreateInput,
    tokenAddress?: string
  ) {
    try {
      return await this.prisma.whiteListedTokens.upsert({
        where: { token_id: tokenAddress },
        update: data,
        create: data,
      });
    } catch (error) {
      console.error('Error upserting token:', error);
      throw new Error('Could not upsert token.');
    }
  }

  async getTokenDataByAddress(address: string) {
    try {
      return await this.prisma.whiteListedTokens.findUnique({
        where: { token_id: address },
      });
    } catch (error) {
      console.error('Error fetching token by address:', error);
      throw new Error('Could not fetch token by address.');
    }
  }

  getWhiteListedTokenModel() {
    return this.prisma.whiteListedTokens;
  }
}

export default WhiteListedTokensModel;
