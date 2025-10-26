import { getConfig } from '@appConfig';
import {
  campaign_twittercard,
  campaignstatus,
  network,
  Prisma,
  user_user,
} from '@prisma/client';
import { provideActiveContract } from '@services/contract-service';
import { allocateBalanceToCampaign } from '@services/transaction-service';
import createPrismaClient from '@shared/prisma';
import { CampaignEvents } from '@V201/events/campaign';
import CampaignLogsModel from '@V201/Modals/CampaignLogs';
import TransactionRecordModel from '@V201/Modals/TransactionRecord';
import WhiteListedTokensModel from '@V201/Modals/WhiteListedTokens';
import {
  updateFungibleBalanceOfCard,
  updateHabrBalanceOfCard,
} from '@V201/modules/Balance';
import { safeParsedData } from '@V201/modules/common';
import { EventPayloadMap } from '@V201/types';
import logger from 'jet-logger';
import { publishEvent } from '../../../../eventPublisher';
import ContractCampaignLifecycle from '@services/ContractCampaignLifecycle';
import JSONBigInt from 'json-bigint';

const handleSmartContractTransaction = async (
  card: campaign_twittercard,
  cardOwner: user_user,
  transactionHandler: (
    card: campaign_twittercard,
    cardOwner: user_user
  ) => Promise<any>
): Promise<void> => {
  try {
    const transactionDetails = await transactionHandler(card, cardOwner);

    logger.info(
      `Smart contract transaction successful for card ID: ${card.id}`
    );

    const prisma = await createPrismaClient();
    const apConfig = await getConfig();

    // log transaction record
    const transactionRecord = await new TransactionRecordModel(
      prisma
    ).createTransaction({
      transaction_data: safeParsedData({
        ...transactionDetails,
        status: String(transactionDetails?.status || 'unknown'),
      }),
      transaction_id: transactionDetails.transactionId,
      status: String(transactionDetails?.status || 'unknown'),
      amount: Number(card.campaign_budget),
      transaction_type: 'campaign_top_up',
      network: apConfig.network.network as network,
    });

    // log campaign status update
    const logableCampaignData: Omit<Prisma.CampaignLogCreateInput, 'campaign'> =
      {
        status: campaignstatus.CampaignRunning,
        message: `Campaign balance ${
          card.campaign_budget ?? 0
        } is added to the SM Contract`,
        data: safeParsedData({
          transaction_id: transactionDetails.transactionId,
          status: transactionDetails.status,
          amount: Number(card.campaign_budget),
          transactionLogId: transactionRecord.id.toString(),
        }),
      };
    publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_SECOND_CONTENT, {
      card,
      cardOwner,
    });
    await new CampaignLogsModel(prisma).createLog({
      ...logableCampaignData,
      campaign: { connect: { id: card.id } },
    });

    // Note: In-memory status update removed as requested
  } catch (error) {
    publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_ERROR, {
      campaignMeta: { campaignId: card.id, userId: cardOwner.id },
      atStage: 'handleSmartContractTransaction',
      message: error.message,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });
    logger.err(
      'Error in handleSmartContractTransaction:' +
        (error instanceof Error
          ? error.stack || error.message
          : JSONBigInt.stringify(error))
    );
    throw error;
  }
};

export const publshCampaignSMTransactionHandlerHBAR = async (
  card: campaign_twittercard,
  cardOwner: user_user
): Promise<void> => {
  if (card.type !== 'HBAR') {
    throw new Error('Unsupported card type for smart contract transaction');
  }

  logger.info(
    `data received for event ${JSONBigInt.stringify({ card, cardOwner })}`
  );

  const { contract_id, campaign_budget } = card;
  const { hedera_wallet_id } = cardOwner;

  if (!contract_id || !campaign_budget || !hedera_wallet_id) {
    logger.err(
      'Location01: Missing required data for smart contract transaction'
    );
    throw new Error('Missing required data for smart contract transaction');
  }

  return handleSmartContractTransaction(card, cardOwner, async () => {
    const contractStateUpdateResult = await allocateBalanceToCampaign(
      card.id,
      campaign_budget,
      hedera_wallet_id,
      contract_id
    );

    if (!contractStateUpdateResult) {
      throw new Error('Failed to update contract state');
    }

    await updateHabrBalanceOfCard(card);

    if (
      contractStateUpdateResult &&
      typeof contractStateUpdateResult === 'object' &&
      'status' in contractStateUpdateResult &&
      contractStateUpdateResult.status &&
      'transactionId' in contractStateUpdateResult &&
      'receipt' in contractStateUpdateResult
    ) {
      // Handle error case
      if (
        'error' in contractStateUpdateResult &&
        contractStateUpdateResult.error
      ) {
        throw new Error(
          `Contract call failed: ${
            contractStateUpdateResult.errorMessage || 'Unknown contract error'
          }`
        );
      }

      return {
        contract_id,
        transactionId: contractStateUpdateResult.transactionId,
        receipt: contractStateUpdateResult.receipt,
        status: contractStateUpdateResult.status.toString(),
      };
    } else {
      return {
        contract_id,
        transactionId:
          'transactionId' in contractStateUpdateResult
            ? (contractStateUpdateResult as any).transactionId
            : undefined,
        receipt:
          'receipt' in contractStateUpdateResult
            ? (contractStateUpdateResult as any).receipt
            : undefined,
        status: undefined,
      };
    }
  });
};

export const publshCampaignSMTransactionHandlerFungible = async (
  card: campaign_twittercard,
  cardOwner: user_user
): Promise<void> => {
  if (card.type !== 'FUNGIBLE') {
    throw new Error('Unsupported card type for smart contract transaction');
  }

  const { contract_id, campaign_budget, fungible_token_id } = card;
  const { hedera_wallet_id } = cardOwner;

  if (
    !contract_id ||
    !campaign_budget ||
    !hedera_wallet_id ||
    !fungible_token_id
  ) {
    throw new Error('Missing required data for smart contract transaction');
  }

  return handleSmartContractTransaction(card, cardOwner, async () => {
    // Get contract details
    const contractDetails = await provideActiveContract();

    if (!contractDetails?.contract_id) {
      throw new Error('No active contract found');
    }

    const campaignLifecycleService = new ContractCampaignLifecycle(
      contractDetails.contract_id
    );
    const transactionDetails =
      await campaignLifecycleService.addFungibleCampaign(
        fungible_token_id,
        contract_id,
        hedera_wallet_id,
        campaign_budget
      );

    if (!transactionDetails) {
      throw new Error('Failed to add campaign to contract');
    }

    const tokendata = await new WhiteListedTokensModel(
      await createPrismaClient()
    ).getTokenDataByAddress(fungible_token_id);

    if (!tokendata) {
      logger.warn('Token data not found');
    }
    if (tokendata) {
      await updateFungibleBalanceOfCard(card, tokendata);
    }

    return transactionDetails;
  });
};

export const handleCampaignPublishTransaction = async ({
  card,
  cardOwner,
}: EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_DO_SM_TRANSACTION]): Promise<void> => {
  const prisma = await createPrismaClient();
  card = (await prisma.campaign_twittercard.findUnique({
    where: { id: card.id },
  })) as campaign_twittercard;
  cardOwner = (await prisma.user_user.findUnique({
    where: { id: cardOwner.id },
  })) as user_user;

  if (!card) {
    throw new Error('Campaign card not found');
  }
  if (!cardOwner) {
    throw new Error('Card owner not found');
  }

  try {
    if (card.type === 'HBAR') {
      return publshCampaignSMTransactionHandlerHBAR(card, cardOwner);
    }

    if (card.type === 'FUNGIBLE') {
      return publshCampaignSMTransactionHandlerFungible(card, cardOwner);
    }

    throw new Error('Unsupported card type for smart contract transaction');
  } catch (error) {
    publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_ERROR, {
      campaignMeta: { campaignId: card.id, userId: cardOwner.id },
      atStage: 'HandleCampaignPublishTransaction',
      message: error.message,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });
    logger.err(
      `Error in HandleCampaignPublishTransaction: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
};
