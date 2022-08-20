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

export default {
  getAll: getAllUser,
  updateWalletId,
} as const;
