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

const topUp = async (id: number | bigint, amounts: number, operation: "increment" | "decrement" | "update") => {
  if (operation === "increment")
    return await prisma.user_user.update({
      where: {
        id,
      },
      data: {
        available_budget: {
          increment: amounts,
        },
      },
    });
  else if (operation === "decrement")
    return await prisma.user_user.update({
      where: {
        id,
      },
      data: {
        available_budget: {
          decrement: amounts,
        },
      },
    });
  else
    return await prisma.user_user.update({
      where: {
        id,
      },
      data: {
        available_budget: amounts,
      },
    });
  //? Perform DN Query
};

export default {
  getAll: getAllUser,
  updateWalletId,
  getUserById,
  topUp,
} as const;
