import { campaign_twittercard, whiteListedTokens } from '@prisma/client';
import { BalanceEvents } from '@V201/events/balances';
import UserBalancesModel from '@V201/Modals/UserBalances';
import UsersModel from '@V201/Modals/Users';
import PrismaClientManager from '@V201/PrismaClient';
import { publishEvent } from 'src/V201/eventPublisher';

const getPrismaClient = async () => {
  return await PrismaClientManager.getInstance();
};

const validateCardData = (card: campaign_twittercard) => {
  if (!card.campaign_budget || !card.owner_id) {
    throw new Error('Missing required data for balance update');
  }
};

export const updateHabrBalanceOfCard = async (card: campaign_twittercard) => {
  validateCardData(card);
  const prismaClient = await getPrismaClient();
  const updatedUser = await new UsersModel(prismaClient).updateUserBalance(
    card.owner_id,
    card.campaign_budget!,
    'decrement'
  );

  publishEvent(BalanceEvents.CAMPAIGNER_HABR_BALANCE_UPDATE, {
    userId: card.owner_id,
    availableBalance: updatedUser.available_budget,
  });

  return updatedUser;
};

export const updateFungibleBalanceOfCard = async (
  card: campaign_twittercard,
  tokenData: whiteListedTokens
) => {
  validateCardData(card);
  if (!tokenData.decimals) {
    throw new Error('Missing required data for fungible balance update');
  }

  const prismaClient = await getPrismaClient();
  const updatedBalanceRecord = await new UserBalancesModel(
    prismaClient
  ).updateTokenBalanceForUser({
    amount: card.campaign_budget!,
    operation: 'decrement',
    token_id: tokenData.id,
    decimal: Number(tokenData.decimals),
    user_id: card.owner_id,
  });

  publishEvent(BalanceEvents.CAMPAIGNER_FUNGIBLE_BALANCE_UPDATE, {
    userId: card.owner_id,
    userBalance: updatedBalanceRecord,
    tokenId: tokenData.token_id,
  });

  return updatedBalanceRecord;
};
