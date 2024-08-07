import prisma from "@shared/prisma";

export const getAllUser = async (params: { limit: number; offset: number }) => {
  const { limit, offset } = params;
  const users = await prisma.user_user.findMany({
    take: limit,
    skip: offset,
  });

  const count = await prisma.user_user.count();
  return { users, count };
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

const getUserByHederaWalletTd = async (hedera_wallet_id: string) => {
  return await prisma.user_user.findUnique({
    where: { hedera_wallet_id },
  });
};

const getUserByAccountAddress = async (accountAddress: string) => {
  return await prisma.user_user.findUnique({
    where: { accountAddress },
  });
};

export const getUserById = async (id: number | bigint) => {
  return await prisma.user_user.findUnique({
    where: { id },
  });
};

const getUserByPersonalTwitterHandle = async (personal_twitter_handle: string) => {
  return await prisma.user_user.findFirst({
    where: {
      personal_twitter_handle,
    },
  });
};

const getAstForUserByAccountAddress = async (userId: number|bigint , deviceId:string) => {
  return await prisma.user_sessions.findFirst({ where: { user_id:userId , device_id:deviceId } });
};

const topUp = async (id: number | bigint, amounts: number, operation: "increment" | "decrement" | "update") => {
  // console.log("topUp start");
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

const updateTokenBalanceForUser = async ({ cntrct_bal, amount, operation, token_id, user_id, decimal }: { cntrct_bal?: number; amount: number; operation: "increment" | "decrement"; token_id: number | bigint; user_id: number | bigint; decimal: number }) => {

  const balRecord = await prisma.user_balances.findFirst({
    where: { user_id, token_id },
  });

  if (!balRecord && operation === "increment")
    return await prisma.user_balances.create({
      data: {
        user_id,
        entity_balance: amount,
        entity_decimal: parseInt(decimal.toString()),
        token_id,
      },
    });

  if (operation == "decrement" && balRecord && cntrct_bal && balRecord.entity_balance && balRecord?.entity_balance - amount === cntrct_bal) {
    return await prisma.user_balances.update({
      data: {
        entity_balance: cntrct_bal,
      },
      where: {
        id: balRecord.id,
      },
    });
  }
  return await prisma.user_balances.update({
    data: {
      entity_balance: {
        [operation]: amount,
      },
    },
    where: {
      id: balRecord?.id,
    },
  });
};

export default {
  getAll: getAllUser,
  updateWalletId,
  getUserById,
  getUserByAccountAddress,
  getUserByHederaWalletTd,
  topUp,
  getUserByTwitterId,
  totalReward,
  getUserByPersonalTwitterHandle,
  updateTokenBalanceForUser,
  getAstForUserByAccountAddress,
} as const;
