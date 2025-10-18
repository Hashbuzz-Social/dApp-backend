import { getConfig } from '@appConfig';
import { AccountId } from '@hashgraph/sdk';
import { campaign_twittercard, user_user } from '@prisma/client';
import initHederaService from '@services/hedera-service';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import ContractCampaignLifecycle from './ContractCampaignLifecycle';
import ContractUtils from './ContractUtilsHandlers';
import HederaSDKCalls from './HederaSDKCalls';

/**
 * Generate a unique request ID for tracking operations
 */
function generateRequestId(): string {
  return `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log contract service events with structured format
 */
function logContractEvent(
  requestId: string,
  operation: string,
  message: string,
  level: 'INFO' | 'ERROR' | 'WARN',
  metadata?: Record<string, any>
): void {
  const logData = {
    timestamp: new Date().toISOString(),
    requestId,
    operation,
    message,
    level,
    metadata: metadata || {},
  };

  if (level === 'ERROR') {
    logger.err(`[CONTRACT_SERVICE] ${JSON.stringify(logData)}`);
  } else if (level === 'WARN') {
    logger.warn(`[CONTRACT_SERVICE] ${JSON.stringify(logData)}`);
  } else {
    logger.info(`[CONTRACT_SERVICE] ${JSON.stringify(logData)}`);
  }
}

/**
 * Execute operations with consistent logging and error handling
 */
async function executeWithLogging<T>(
  requestId: string,
  operation: string,
  description: string,
  executeFunction: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  try {
    logger.info(`[${requestId}] ${operation}: ${description}`);

    logContractEvent(
      requestId,
      operation,
      `${description} - Started`,
      'INFO',
      metadata
    );

    const result = await executeFunction();

    logContractEvent(
      requestId,
      operation,
      `${description} - Completed successfully`,
      'INFO',
      { ...metadata, success: true }
    );

    logger.info(`[${requestId}] ${operation}: ${description} - Completed`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.err(
      `[${requestId}] ${operation}: ${description} - Failed: ${errorMessage}`
    );

    logContractEvent(
      requestId,
      operation,
      `${description} - Failed: ${errorMessage}`,
      'ERROR',
      {
        ...metadata,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    throw new Error(`${operation} failed: ${errorMessage}`);
  }
}

// Function to provide the active contract details
export const provideActiveContract = async () => {
  const requestId = generateRequestId();

  try {
    logger.info(`[${requestId}] Retrieving active contract details`);

    const prisma = await createPrismaClient();
    const appConfig = await getConfig();
    const hederaService = await initHederaService();

    const availableContracts = await executeWithLogging(
      requestId,
      'QUERY_ACTIVE_CONTRACTS',
      'Querying active contracts from database',
      () =>
        prisma.smartcontracts.findMany({
          where: {
            is_active: true,
            network: hederaService.network,
          },
        }),
      { network: hederaService.network }
    );

    if (
      availableContracts &&
      Array.isArray(availableContracts) &&
      availableContracts.length > 0
    ) {
      const { contract_id, contractAddress, logicalContract_id } =
        availableContracts[0];

      logContractEvent(
        requestId,
        'CONTRACT_FOUND',
        'Active contract found in database',
        'INFO',
        {
          contractId: contract_id,
          contractAddress,
          logicalContractId: logicalContract_id,
          contractsCount: availableContracts.length,
        }
      );

      return { contract_id, contractAddress, logicalContract_id };
    } else {
      logger.warn(
        `[${requestId}] No active contract found in records, getting from environment config`
      );

      const contract_id_new = appConfig.network.contractAddress;
      if (contract_id_new) {
        const contractData = (await executeWithLogging(
          requestId,
          'CREATE_CONTRACT_RECORD',
          'Creating new contract record from environment config',
          () =>
            prisma.smartcontracts.create({
              data: {
                contractAddress:
                  AccountId.fromString(contract_id_new).toSolidityAddress(),
                contract_id: `${contract_id_new}`,
                logicalContract_id: `${contract_id_new}`,
                is_active: true,
                lcFileID: contract_id_new ?? '',
                network: hederaService.network,
                fileId: contract_id_new ?? '',
                created_at: new Date().toISOString(),
              },
            }),
          {
            contractIdNew: contract_id_new,
            network: hederaService.network,
          }
        )) as {
          contract_id: string;
          contractAddress: string;
          logicalContract_id: string;
        };

        return {
          contract_id: contractData.contract_id,
          contractAddress: contractData.contractAddress,
          logicalContract_id: contractData.logicalContract_id,
        };
      } else {
        throw new Error(
          'No contract address found in environment configuration'
        );
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.err(
      `[${requestId}] Failed to provide active contract: ${errorMessage}`
    );

    logContractEvent(
      requestId,
      'PROVIDE_ACTIVE_CONTRACT_FAILED',
      `Failed to retrieve active contract: ${errorMessage}`,
      'ERROR',
      {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    return null;
  }
};

// Function to add a fungible and NFT campaign
export async function addFungibleAndNFTCampaign(
  tokenId: string,
  amount: number,
  user_id: string,
  campaign: string
) {
  const requestId = generateRequestId();

  try {
    logger.info(
      `[${requestId}] Adding fungible/NFT campaign for user ${user_id}`
    );

    const contractDetails = await executeWithLogging(
      requestId,
      'GET_CONTRACT_DETAILS',
      'Retrieving active contract details for campaign creation',
      () => provideActiveContract(),
      { tokenId, amount, userId: user_id, campaign }
    );

    if (contractDetails?.contract_id) {
      const campaignLifecycleService = new ContractCampaignLifecycle(
        contractDetails.contract_id
      );

      const addCampaignFungibleStateUpdate = await executeWithLogging(
        requestId,
        'ADD_FUNGIBLE_CAMPAIGN',
        'Adding fungible campaign to smart contract',
        () =>
          campaignLifecycleService.addFungibleCampaign(
            tokenId,
            campaign,
            user_id,
            amount
          ),
        {
          contractId: contractDetails.contract_id,
          tokenId,
          campaign,
          userId: user_id,
          amount,
        }
      );

      return addCampaignFungibleStateUpdate;
    } else {
      throw new Error(
        'No active contract found for fungible campaign creation'
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.err(
      `[${requestId}] Failed to add fungible/NFT campaign: ${errorMessage}`
    );

    logContractEvent(
      requestId,
      'ADD_FUNGIBLE_CAMPAIGN_FAILED',
      `Failed to add fungible/NFT campaign: ${errorMessage}`,
      'ERROR',
      {
        tokenId,
        amount,
        userId: user_id,
        campaign,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    throw error;
  }
}

// Function to close a fungible and NFT campaign
export async function closeFungibleAndNFTCampaign(campaign: string) {
  const requestId = generateRequestId();

  try {
    logger.info(`[${requestId}] Closing fungible/NFT campaign: ${campaign}`);

    const contractDetails = await executeWithLogging(
      requestId,
      'GET_CONTRACT_DETAILS',
      'Retrieving active contract details for campaign closure',
      () => provideActiveContract(),
      { campaign }
    );

    const appConfig = await getConfig();
    const expiryDuration =
      Number(appConfig.app.defaultCampaignDuration ?? 15) * 60;

    if (contractDetails?.contract_id) {
      const campaignLifecycleService = new ContractCampaignLifecycle(
        contractDetails.contract_id
      );

      const closeCampaignStateUpdate = await executeWithLogging(
        requestId,
        'CLOSE_FUNGIBLE_CAMPAIGN',
        'Closing fungible campaign in smart contract',
        () =>
          campaignLifecycleService.closeFungibleCampaign(
            campaign,
            expiryDuration
          ),
        {
          contractId: contractDetails.contract_id,
          campaign,
          expiryDuration,
        }
      );

      return closeCampaignStateUpdate;
    } else {
      throw new Error('No active contract found for campaign closure');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.err(
      `[${requestId}] Failed to close fungible/NFT campaign: ${errorMessage}`
    );

    logContractEvent(
      requestId,
      'CLOSE_FUNGIBLE_CAMPAIGN_FAILED',
      `Failed to close fungible/NFT campaign: ${errorMessage}`,
      'ERROR',
      {
        campaign,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    throw error;
  }
}

// Function to expire a fungible campaign
export async function expiryFungibleCampaign(
  card: campaign_twittercard,
  cardOwner: user_user
) {
  const requestId = generateRequestId();

  try {
    logger.info(
      `[${requestId}] Fungible campaign expiry operation for card: ${card.id}`
    );

    const contractDetails = await executeWithLogging(
      requestId,
      'GET_CONTRACT_DETAILS',
      'Retrieving active contract details for fungible campaign expiry',
      () => provideActiveContract(),
      {
        cardId: card.id.toString(),
        campaignContractId: card.contract_id,
        fungibleTokenId: card.fungible_token_id,
        campaignerWallet: cardOwner.hedera_wallet_id,
      }
    );

    // Validate required parameters
    if (!contractDetails?.contract_id) {
      throw new Error('No active contract found for fungible campaign expiry');
    }

    if (!card.contract_id) {
      throw new Error('Campaign contract ID is missing');
    }

    if (!card.fungible_token_id) {
      throw new Error('Fungible token ID is missing for campaign');
    }

    if (!cardOwner.hedera_wallet_id) {
      throw new Error('Campaigner wallet ID is missing');
    }

    const campaignLifecycleService = new ContractCampaignLifecycle(
      contractDetails.contract_id
    );

    const props = {
      tokenId: card.fungible_token_id,
      campaignAddress: card.contract_id,
      campaigner: cardOwner.hedera_wallet_id,
    };

    const expiryCampaignStateUpdate = await executeWithLogging(
      requestId,
      'EXPIRE_FUNGIBLE_CAMPAIGN',
      'Executing fungible campaign expiry in smart contract',
      () => campaignLifecycleService.expiryFungibleCampaign(props),
      {
        contractId: contractDetails.contract_id,
        cardId: card.id.toString(),
        tokenId: card.fungible_token_id,
        campaignAddress: card.contract_id,
        campaigner: cardOwner.hedera_wallet_id,
      }
    );

    logger.info(
      `[${requestId}] Expiry campaign transaction status for card ${card.id.toString()}: ${expiryCampaignStateUpdate?.status.toString()}`
    );

    return expiryCampaignStateUpdate;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.err(
      `[${requestId}] Failed to expire fungible campaign: ${errorMessage}`
    );

    logContractEvent(
      requestId,
      'EXPIRE_FUNGIBLE_CAMPAIGN_FAILED',
      `Failed to expire fungible campaign: ${errorMessage}`,
      'ERROR',
      {
        cardId: card.id.toString(),
        campaignContractId: card.contract_id,
        fungibleTokenId: card.fungible_token_id,
        campaignerWallet: cardOwner.hedera_wallet_id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    throw error;
  }
}

// Function to expire a campaign
export async function expiryCampaign(
  card: campaign_twittercard,
  cardOwner: user_user
) {
  const requestId = generateRequestId();

  try {
    logger.info(
      `[${requestId}] SM transaction for update expiry status of card: ${card.id}`
    );

    // Get active contract for transaction
    const contractDetails = await executeWithLogging(
      requestId,
      'GET_CONTRACT_DETAILS',
      'Retrieving active contract details for campaign expiry',
      () => provideActiveContract(),
      {
        cardId: card.id.toString(),
        campaignContractId: card.contract_id,
        campaignerWallet: cardOwner.hedera_wallet_id,
      }
    );

    // Validate required conditions
    if (!contractDetails?.contract_id) {
      throw new Error('No active contract found for campaign expiry');
    }

    if (!cardOwner.hedera_wallet_id) {
      throw new Error('Campaigner wallet ID is missing');
    }

    if (!card.contract_id) {
      throw new Error('Campaign contract ID is missing');
    }

    const campaignLifecycleService = new ContractCampaignLifecycle(
      contractDetails.contract_id
    );

    const campagnExpiryStatusUpdate = await executeWithLogging(
      requestId,
      'EXPIRE_CAMPAIGN',
      'Executing campaign expiry in smart contract',
      () =>
        campaignLifecycleService.expiryCampaign(
          card.contract_id as string,
          cardOwner.hedera_wallet_id
        ),
      {
        contractId: contractDetails.contract_id,
        cardId: card.id.toString(),
        campaignAddress: card.contract_id,
        campaigner: cardOwner.hedera_wallet_id,
      }
    );

    logger.info(
      `[${requestId}] Expiry campaign SM transaction status for card ${
        card.id
      }: ${campagnExpiryStatusUpdate?.status.toString()}`
    );

    return campagnExpiryStatusUpdate;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.err(`[${requestId}] Failed to expire campaign: ${errorMessage}`);

    logContractEvent(
      requestId,
      'EXPIRE_CAMPAIGN_FAILED',
      `Failed to expire campaign: ${errorMessage}`,
      'ERROR',
      {
        cardId: card.id.toString(),
        campaignContractId: card.contract_id,
        campaignerWallet: cardOwner.hedera_wallet_id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    throw error;
  }
}

// Function to distribute tokens using SDK
export async function distributeTokenUsingSDK(params: {
  tokenId: string;
  userId: string;
  amount: number;
  xHandle: string;
}) {
  const requestId = generateRequestId();

  try {
    const { amount, userId, tokenId, xHandle } = params;

    logger.info(
      `[${requestId}] Distributing tokens via SDK for user: ${userId}`
    );

    const contractDetails = await executeWithLogging(
      requestId,
      'GET_CONTRACT_DETAILS',
      'Retrieving active contract details for token distribution',
      () => provideActiveContract(),
      { tokenId, userId, amount, xHandle }
    );

    if (!contractDetails?.contract_id) {
      throw new Error('No active contract found for token distribution');
    }

    const hederaServiceData = await executeWithLogging(
      requestId,
      'INIT_HEDERA_SERVICE',
      'Initializing Hedera service for token distribution',
      () => initHederaService(),
      { contractId: contractDetails.contract_id }
    );

    // Handle the Hedera service response
    const { operatorId, operatorKey, hederaClient } = hederaServiceData;

    const hederaSDKCallHandler = new HederaSDKCalls(
      hederaClient,
      operatorId,
      operatorKey
    );

    const transactionReceipt = await executeWithLogging(
      requestId,
      'REWARD_INTERACTOR',
      'Rewarding interactor with tokens via Hedera SDK',
      () =>
        hederaSDKCallHandler.rewardIntractorWithToken(
          userId,
          amount,
          tokenId,
          xHandle
        ),
      {
        contractId: contractDetails.contract_id,
        operatorId,
        userId,
        amount,
        tokenId,
        xHandle,
      }
    );

    return transactionReceipt;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.err(
      `[${requestId}] Error in distributeTokenUsingSDK: ${errorMessage}`
    );

    logContractEvent(
      requestId,
      'DISTRIBUTE_TOKEN_SDK_FAILED',
      `Failed to distribute tokens using SDK: ${errorMessage}`,
      'ERROR',
      {
        ...params,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    throw new Error(`Error in distributeTokenUsingSDK: ${errorMessage}`);
  }
}

export const getSMInfo = async () => {
  const requestId = generateRequestId();

  try {
    logger.info(`[${requestId}] Retrieving smart contract information`);

    const activeContract = await executeWithLogging(
      requestId,
      'GET_SM_INFO',
      'Retrieving smart contract information',
      () => provideActiveContract()
    );

    return activeContract;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.err(`[${requestId}] Failed to get SM info: ${errorMessage}`);

    logContractEvent(
      requestId,
      'GET_SM_INFO_FAILED',
      `Failed to retrieve smart contract information: ${errorMessage}`,
      'ERROR',
      {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    throw error;
  }
};

export const queryCampaignBalanceFromContract = async (
  campaignAddress: string,
  tokenId: string | null = null
) => {
  const requestId = generateRequestId();

  try {
    logger.info(`[${requestId}] Querying campaign balance from contract`);

    const contractDetails = await executeWithLogging(
      requestId,
      'GET_CONTRACT_DETAILS',
      'Retrieving active contract details for balance query',
      () => provideActiveContract(),
      { campaignAddress, tokenId }
    );

    if (!contractDetails?.contract_id) {
      throw new Error('No active contract found for balance query');
    }

    const contractUtils = new ContractUtils(contractDetails.contract_id);

    if (tokenId) {
      const balance = await executeWithLogging(
        requestId,
        'QUERY_FUNGIBLE_BALANCE',
        'Querying fungible campaign balance from contract',
        () =>
          contractUtils.getFungibleCampaignBalance(campaignAddress, tokenId),
        {
          contractId: contractDetails.contract_id,
          campaignAddress,
          tokenId,
        }
      );
      return balance;
    } else {
      const balance = await executeWithLogging(
        requestId,
        'QUERY_CAMPAIGN_BALANCE',
        'Querying HBAR campaign balance from contract',
        () => contractUtils.getCampaignBalance(campaignAddress),
        {
          contractId: contractDetails.contract_id,
          campaignAddress,
        }
      );
      return balance;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.err(
      `[${requestId}] Failed to query campaign balance: ${errorMessage}`
    );

    logContractEvent(
      requestId,
      'QUERY_CAMPAIGN_BALANCE_FAILED',
      `Failed to query campaign balance: ${errorMessage}`,
      'ERROR',
      {
        campaignAddress,
        tokenId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    throw error;
  }
};

export const queryFungibleBalanceOfCampaigner = async (
  address: string,
  fungible_tokenId: string
) => {
  const requestId = generateRequestId();

  try {
    logger.info(`[${requestId}] Querying fungible balance of campaigner`);

    const contractDetails = await executeWithLogging(
      requestId,
      'GET_CONTRACT_DETAILS',
      'Retrieving active contract details for fungible balance query',
      () => provideActiveContract(),
      { address, fungibleTokenId: fungible_tokenId }
    );

    if (!contractDetails?.contract_id) {
      throw new Error('No active contract found for fungible balance query');
    }

    const utilsHandlerService = new ContractUtils(contractDetails.contract_id);

    const balances = await executeWithLogging(
      requestId,
      'QUERY_FUNGIBLE_TOKEN_BALANCE',
      'Querying fungible token balance of campaigner',
      () =>
        utilsHandlerService.getFungibleTokenBalance(address, fungible_tokenId),
      {
        contractId: contractDetails.contract_id,
        address,
        fungibleTokenId: fungible_tokenId,
      }
    );

    return Number(balances);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.err(
      `[${requestId}] Failed to query fungible balance: ${errorMessage}`
    );

    logContractEvent(
      requestId,
      'QUERY_FUNGIBLE_BALANCE_FAILED',
      `Failed to query fungible balance of campaigner: ${errorMessage}`,
      'ERROR',
      {
        address,
        fungibleTokenId: fungible_tokenId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    throw error;
  }
};

export const queryBalance = async (address: string) => {
  const requestId = generateRequestId();

  try {
    logger.info(`[${requestId}] Querying HBAR balance for address`);

    // Execute the contract to check changes in state variable
    const solidityAddress = AccountId.fromString(address).toSolidityAddress();

    const contractDetails = await executeWithLogging(
      requestId,
      'GET_CONTRACT_DETAILS',
      'Retrieving active contract details for HBAR balance query',
      () => provideActiveContract(),
      { address, solidityAddress }
    );

    if (!contractDetails?.contract_id) {
      throw new Error('No active contract found for HBAR balance query');
    }

    const utilsHandlerService = new ContractUtils(contractDetails.contract_id);

    const balances = await executeWithLogging(
      requestId,
      'QUERY_HBAR_BALANCE',
      'Querying HBAR balance from contract',
      () => utilsHandlerService.getHbarBalance(solidityAddress),
      {
        contractId: contractDetails.contract_id,
        address,
        solidityAddress,
      }
    );

    return { balances };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.err(`[${requestId}] Failed to query HBAR balance: ${errorMessage}`);

    logContractEvent(
      requestId,
      'QUERY_HBAR_BALANCE_FAILED',
      `Failed to query HBAR balance: ${errorMessage}`,
      'ERROR',
      {
        address,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    throw error;
  }
};
