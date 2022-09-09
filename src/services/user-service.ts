import prisma from "@shared/prisma";

export const getAllUser = async () => {
  const users = await prisma.user_user.findMany({
    orderBy: { id: "asc" },
  });
  return users;
};

const updateWalletId = async (walletId: string, userId: bigint) => {
  const updateUserWallet = prisma.user_user.update({ data: { hedera_wallet_id: walletId }, where: { id: userId } });
  return updateUserWallet;
};

const getUserById = async (id?: number | bigint) => {
  return await prisma.user_user.findUnique({ where: { id } });
};

const topUp = async (id: number | bigint, amount: number, isIncrement = true) => {
  amount = (amount - amount * 0.1) * Math.pow(10, 8);
  if (isIncrement)
    return await prisma.user_user.update({
      where: {
        id,
      },
      data: {
        available_budget: {
          increment: parseInt(amount.toFixed(0)),
        },
      },
    });
  else {
    return await prisma.user_user.update({
      where: {
        id,
      },
      data: {
        available_budget: parseInt(amount.toFixed(0)),
      },
    });
  }
};

export default {
  getAll: getAllUser,
  updateWalletId,
  getUserById,
  topUp,
} as const;
