import { user_balances } from '@prisma/client';

export type CampaignerHbarBalUpdatePayload = {
  userId: number | bigint;
  availableBalance: number;
};

export type CampaignerFuncgibleBalanceUpdatePayload = {
  userId: number | bigint;
  userBalance: user_balances;
  tokenId: string;
};
