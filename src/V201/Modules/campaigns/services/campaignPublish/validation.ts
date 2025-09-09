import {
    campaign_twittercard,
    campaignstatus,
    user_user
} from '@prisma/client';
import createPrismaClient from '@shared/prisma';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import UserBalancesModel from '@V201/Modals/UserBalances';
import WhiteListedTokensModel from '@V201/Modals/WhiteListedTokens';
import PrismaClientManager from '@V201/PrismaClient';
  
  

const validationMessages = {
    runningCardExists: 'There is a card already in running status',
    sameState: 'Campaign already has the same state from before',
    adminApprovalRequired: 'Admin approval for content is required',
    contractIdMissing: 'ID for contract is missing in the record.',
    insufficientBudget:
      'User available budget is lower than the required campaign budget',
    noValidToken: 'There is no valid token associated with the card',
    insufficientTokenBalance: 'Insufficient balance to start the campaign',
    unsupportedType: 'Unsupported campaign type',
    allChecksPassed: 'All checks passed',
  };
  
  /**
   * Validates if the campaign can be transitioned to the running state.
   * @param card - The campaign card details.
   * @param currentCardStatusToValidate - The status to validate against.
   * @returns An object containing the validation result and an optional message.
   */
  
  export const isCampaignValidForMakeRunning = async (
    card: campaign_twittercard & { user_user?: user_user },
    currentCardStatusToValidate: campaignstatus
  ): Promise<{ isValid: boolean; message?: string }> => {
    const {
      user_user: cardOwner,
      card_status,
      approve,
      contract_id,
      type,
      campaign_budget,
      fungible_token_id,
    } = card;
  
    const prisma = await createPrismaClient();
  
    const runningCardCount = await new CampaignTwitterCardModel(
      prisma
    ).getCampaignCountByStatus(campaignstatus.CampaignRunning, card.id);
  
    if (Number(runningCardCount) > 0) {
      return { isValid: false, message: validationMessages.runningCardExists };
    }
  
    if (
      card_status.toLocaleLowerCase() ===
      currentCardStatusToValidate.toLocaleLowerCase()
    ) {
      return { isValid: false, message: validationMessages.sameState };
    }
  
    if (!approve) {
      return {
        isValid: false,
        message: validationMessages.adminApprovalRequired,
      };
    }
  
    if (!contract_id) {
      return { isValid: false, message: validationMessages.contractIdMissing };
    }
  
    // Check if the user has sufficient budget to start the campaign
    if (type === 'HBAR') {
      if (Number(cardOwner?.available_budget) < Number(campaign_budget)) {
        return { isValid: false, message: validationMessages.insufficientBudget };
      }
      // All checks passed for HBAR
      return { isValid: true, message: validationMessages.allChecksPassed };
    }
  
    // Check if the user has sufficient token balance to start the campaign
    if (type === 'FUNGIBLE') {
      if (!fungible_token_id) {
        return { isValid: false, message: validationMessages.noValidToken };
      }
  
      const tokenData = await new WhiteListedTokensModel(
        prisma
      ).getTokenDataByAddress(fungible_token_id);
      if (!tokenData) {
        return { isValid: false, message: validationMessages.noValidToken };
      }
  
      const tokenBalData = await new UserBalancesModel(prisma).getBalanceById(
        tokenData.id
      );
  
      if (!tokenBalData) {
        return { isValid: false, message: validationMessages.noValidToken };
      }
  
      const hasSufficientTokenBalance =
        Number(tokenBalData.entity_balance) >= Number(campaign_budget);
      if (!hasSufficientTokenBalance) {
        return {
          isValid: false,
          message: validationMessages.insufficientTokenBalance,
        };
      }
  
      // All checks passed for fungible token
      return { isValid: true, message: validationMessages.allChecksPassed };
    }
  
    return { isValid: false, message: validationMessages.unsupportedType };
  };
  