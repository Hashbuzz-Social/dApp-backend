import prisma from "@shared/prisma";

export const getAllUser = async () => {
  const users = await prisma.user_user.findMany({
    orderBy: { id: "asc" },
  });
  return users;
};

const updateWalletId = async (walletId: string, userId: bigint) => {
  const user = await prisma.user_user.findUnique({ where: { id: userId } });
  if (!user?.hedera_wallet_id) {
    const updateUserWallet = await prisma.user_user.update({
      where: { id: userId },
      data: { hedera_wallet_id: walletId },
    });
    return updateUserWallet;
  }
  return false;
};

const getUserById = async (id?: number | bigint) => {
  return await prisma.user_user.findUnique({ where: { id } });
};

const getUserByUserName = async (username: string) => {
  return await prisma.user_user.findUnique({
    where: {
      username,
    },
  });
};

const topUp = async (id: number | bigint, amounts: number, operation: "increment" | "decrement" | "update") => {
  console.log("topUp start");
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

const totalReward = async (userId: number | bigint, amounts: number, operation: "increment" | "decrement" | "update") => {
  if (operation === "increment")
    return await prisma.user_user.update({
      where: {
        id: userId,
      },
      data: {
        total_rewarded: {
          increment: amounts,
        },
      },
    });
  else if (operation === "decrement")
    return await prisma.user_user.update({
      where: {
        id: userId,
      },
      data: {
        total_rewarded: {
          decrement: amounts,
        },
      },
    });
  else
    return await prisma.user_user.update({
      where: {
        id: userId,
      },
      data: {
        total_rewarded: amounts,
      },
    });
};

const getUserByTwitterId = async (personal_twitter_id: string) => {
  return await prisma.user_user.findFirst({
    where: {
      personal_twitter_id,
    },
  });
};

export default {
  getAll: getAllUser,
  updateWalletId,
  getUserById,
  topUp,
  getUserByTwitterId,
  totalReward,
  getUserByUserName,
} as const;
