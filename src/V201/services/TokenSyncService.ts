import { AccountId } from '@hashgraph/sdk';
import createPrismaClient from '@shared/prisma';
import NetworkHelpers from '@shared/NetworkHelpers';
import { utilsHandlerService, default as ContractUtilsHandler } from '@services/ContractUtilsHandlers';
import logger from 'jet-logger';
import { AccountDetails, TokenBalance } from 'src/@types/networkResponses';
import { getConfig } from '@appConfig';
import { provideActiveContract } from '@services/contract-service';

/**
 * TokenSyncService
 *
 * Synchronizes whitelisted tokens between:
 * 1. Smart Contract (getAllWhitelistedTokens)
 * 2. Hedera Network (account associated tokens)
 * 3. Local Database (whiteListedTokens table)
 *
 * This ensures consistency across all three sources and prevents:
 * - Orphaned tokens in database (not on network/contract)
 * - Missing tokens in database (exists on contract but not in DB)
 * - Network association mismatches
 */
export class TokenSyncService {
  /**
   * Synchronize whitelisted tokens on server startup
   * Non-fatal: Logs errors but doesn't block server startup
   */
  static async syncWhitelistedTokens(): Promise<{
    synced: boolean;
    localTokens: number;
    networkTokens: number;
    contractTokens: number;
    tokensAdded: number;
    tokensRemoved: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let tokensAdded = 0;
    let tokensRemoved = 0;

    try {
      const appConfig = await getConfig();
      // Get active contract details from contract-service (reads DB or falls back to config)
      const activeContract = await provideActiveContract();
      const contractAccountId = activeContract?.contract_id || appConfig.network.contractAddress;

      if (!contractAccountId) {
        const errorMsg = 'Contract account ID not configured';
        errors.push(errorMsg);
        logger.warn(`⚠️  Token Sync: ${errorMsg}`);
        return {
          synced: false,
          localTokens: 0,
          networkTokens: 0,
          contractTokens: 0,
          tokensAdded: 0,
          tokensRemoved: 0,
          errors,
        };
      }

      const prisma = await createPrismaClient();

      // 1. Fetch tokens from all three sources
      logger.info('🔄 Token Sync: Fetching tokens from contract, network, and database...');

      const [contractTokens, networkData, localTokens] = await Promise.all([
        this.getContractTokens(contractAccountId).catch((err) => {
          const errorMsg = `Failed to fetch contract tokens: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(errorMsg);
          logger.err(errorMsg);
          return [] as string[];
        }),
        this.getNetworkTokens(contractAccountId, appConfig.app.mirrorNodeURL).catch((err) => {
          const errorMsg = `Failed to fetch network tokens: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(errorMsg);
          logger.err(errorMsg);
          return [] as TokenBalance[];
        }),
        prisma.whiteListedTokens.findMany().catch((err) => {
          const errorMsg = `Failed to fetch local tokens: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(errorMsg);
          logger.err(errorMsg);
          return [];
        }),
      ]);

      // Convert contract tokens (EVM addresses) to Hedera token IDs
      const contractTokenIds = contractTokens.map((evmAddress) =>
        AccountId.fromEvmAddress(0, 0, evmAddress).toString()
      );

      const networkTokenIds = networkData.map((t) => t.token_id);
      const localTokenIds = localTokens.map((t) => t.token_id);

      logger.info(
        `📊 Token Sync: Contract=${contractTokenIds.length}, Network=${networkTokenIds.length}, Local=${localTokenIds.length}`
      );

      // 2. Find discrepancies

      // Tokens in local DB but NOT in contract (should remove from DB)
      const orphanedInLocal = localTokens.filter(
        (localToken) => !contractTokenIds.includes(localToken.token_id)
      );

      // Tokens in contract but NOT in local DB (should add to DB)
      const missingInLocal = contractTokenIds.filter(
        (contractTokenId) => !localTokenIds.includes(contractTokenId)
      );

      // Tokens in contract but NOT associated on network (should disassociate from contract)
      const notAssociatedOnNetwork = contractTokenIds.filter(
        (contractTokenId) => !networkTokenIds.includes(contractTokenId)
      );

      // 3. Apply fixes

      // Remove orphaned tokens from local DB
      if (orphanedInLocal.length > 0) {
        try {
          const result = await prisma.whiteListedTokens.deleteMany({
            where: {
              token_id: {
                in: orphanedInLocal.map((t) => t.token_id),
              },
            },
          });
          tokensRemoved = result.count;
          logger.info(
            `🗑️  Token Sync: Removed ${tokensRemoved} orphaned tokens from local DB: ${orphanedInLocal
              .map((t) => t.token_id)
              .join(', ')}`
          );
        } catch (err) {
          const errorMsg = `Failed to remove orphaned tokens: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(errorMsg);
          logger.err(errorMsg);
        }
      }

      // Add missing tokens to local DB (fetch details from network first)
      if (missingInLocal.length > 0) {
        logger.info(
          `➕ Token Sync: Adding ${missingInLocal.length} missing tokens to local DB...`
        );

        const networkHelpers = new NetworkHelpers(appConfig.app.mirrorNodeURL);

        // Get admin user ID for added_by field (required by schema)
        // Try multiple strategies to find a valid user
        let adminUser = await prisma.user_user.findFirst({
          where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
        });

        if (!adminUser) {
          // Fall back to operator wallet ID match
          adminUser = await prisma.user_user.findFirst({
            where: { hedera_wallet_id: appConfig.network.accountID },
          });
        }

        if (!adminUser) {
          // Fall back to any existing user
          adminUser = await prisma.user_user.findFirst({
            orderBy: { id: 'asc' },
          });
        }

        if (!adminUser) {
          const errorMsg =
            'No users found in database - cannot add tokens. Please create at least one user first.';
          errors.push(errorMsg);
          logger.err(errorMsg);
        } else {
          logger.info(
            `Token Sync: Using user ID ${adminUser.id} (${adminUser.name || 'Unknown'}) for added_by field`
          );
          for (const tokenId of missingInLocal) {
            try {
              // Fetch token details from Hedera Mirror Node
              const tokenDetails = await networkHelpers.getTokenDetails<{
                name: string;
                symbol: string;
                decimals: string;
                type: string;
              }>(tokenId);

              await prisma.whiteListedTokens.create({
                data: {
                  token_id: tokenId,
                  name: tokenDetails.name,
                  token_symbol: tokenDetails.symbol,
                  decimals: parseInt(tokenDetails.decimals, 10),
                  token_type: tokenDetails.type,
                  added_by: adminUser.id,
                  contract_id: appConfig.network.contractAddress,
                },
              });

              tokensAdded++;
              logger.info(
                `✅ Token Sync: Added ${tokenDetails.symbol} (${tokenId}) to local DB`
              );
            } catch (err) {
              const errorMsg = `Failed to add token ${tokenId}: ${err instanceof Error ? err.message : String(err)}`;
              errors.push(errorMsg);
              logger.err(errorMsg);
            }
          }
        }
      }

      // Disassociate tokens from contract if not on network
      if (notAssociatedOnNetwork.length > 0) {
        logger.warn(
          `⚠️  Token Sync: ${notAssociatedOnNetwork.length} tokens in contract but not associated on network`
        );

        for (const tokenId of notAssociatedOnNetwork) {
          try {
            logger.info(`🔧 Token Sync: Disassociating ${tokenId} from contract...`);
            // Prefer using ContractUtilsHandler bound to active contract if available
            if (activeContract?.contract_id) {
              const contractUtils = new ContractUtilsHandler(activeContract.contract_id);
              await contractUtils.associateToken(tokenId, false);
            } else {
              await utilsHandlerService.associateToken(tokenId, false);
            }
            logger.info(`✅ Token Sync: Disassociated ${tokenId} from contract`);
          } catch (err) {
            const errorMsg = `Failed to disassociate token ${tokenId}: ${err instanceof Error ? err.message : String(err)}`;
            errors.push(errorMsg);
            logger.err(errorMsg);
          }
        }
      }

      const synced = errors.length === 0;
      const statusIcon = synced ? '✅' : '⚠️';

      logger.info(
        `${statusIcon} Token Sync: Complete - Added=${tokensAdded}, Removed=${tokensRemoved}, Errors=${errors.length}`
      );

      return {
        synced,
        localTokens: localTokenIds.length,
        networkTokens: networkTokenIds.length,
        contractTokens: contractTokenIds.length,
        tokensAdded,
        tokensRemoved,
        errors,
      };
    } catch (error) {
      const errorMsg = `Token sync failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.err(errorMsg);

      return {
        synced: false,
        localTokens: 0,
        networkTokens: 0,
        contractTokens: 0,
        tokensAdded: 0,
        tokensRemoved: 0,
        errors,
      };
    }
  }

  /**
   * Get all whitelisted tokens from smart contract
   * Returns EVM addresses
   */
  private static async getContractTokens(contractAccountId?: string): Promise<string[]> {
    // Try to use active contract details from contract-service first
    try {
      const active = await provideActiveContract();
      const contractId = active?.contract_id || contractAccountId;
      if (contractId) {
        const contractUtils = new ContractUtilsHandler(contractId);
        return await contractUtils.getAllWhitelistedTokens();
      }
    } catch (err) {
      logger.warn(`Token Sync: getContractTokens failed to use contract service: ${String(err)}`);
    }

    // Fallback to global handler
    return await utilsHandlerService.getAllWhitelistedTokens();
  }

  /**
   * Get all tokens associated with contract account on Hedera network
   */
  private static async getNetworkTokens(
    accountId: string,
    mirrorNodeURL: string
  ): Promise<TokenBalance[]> {
    const networkHelpers = new NetworkHelpers(mirrorNodeURL);
    const accountDetails = await networkHelpers.getAccountDetails<AccountDetails>(accountId);
    return accountDetails.balance?.tokens || [];
  }

  /**
   * Get sync status for monitoring (without performing sync)
   */
  static async getSyncStatus(): Promise<{
    inSync: boolean;
    localCount: number;
    contractCount: number;
    networkCount: number;
    discrepancies: {
      orphanedInLocal: string[];
      missingInLocal: string[];
      notOnNetwork: string[];
    };
  }> {
    try {
      const appConfig = await getConfig();
      const contractAccountId = appConfig.network.contractAddress;

      if (!contractAccountId) {
        throw new Error('Contract account ID not configured');
      }

      const prisma = await createPrismaClient();

      const [contractTokens, networkData, localTokens] = await Promise.all([
        this.getContractTokens(),
        this.getNetworkTokens(contractAccountId, appConfig.app.mirrorNodeURL),
        prisma.whiteListedTokens.findMany(),
      ]);

      const contractTokenIds = contractTokens.map((evmAddress) =>
        AccountId.fromEvmAddress(0, 0, evmAddress).toString()
      );

      const networkTokenIds = networkData.map((t) => t.token_id);
      const localTokenIds = localTokens.map((t) => t.token_id);

      const orphanedInLocal = localTokenIds.filter(
        (id) => !contractTokenIds.includes(id)
      );
      const missingInLocal = contractTokenIds.filter(
        (id) => !localTokenIds.includes(id)
      );
      const notOnNetwork = contractTokenIds.filter(
        (id) => !networkTokenIds.includes(id)
      );

      const inSync =
        orphanedInLocal.length === 0 &&
        missingInLocal.length === 0 &&
        notOnNetwork.length === 0;

      return {
        inSync,
        localCount: localTokenIds.length,
        contractCount: contractTokenIds.length,
        networkCount: networkTokenIds.length,
        discrepancies: {
          orphanedInLocal,
          missingInLocal,
          notOnNetwork,
        },
      };
    } catch (error) {
      logger.err(
        `Failed to get sync status: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }
}
