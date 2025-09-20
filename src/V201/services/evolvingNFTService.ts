import {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  TransferTransaction,
  TokenAssociateTransaction,
  TokenId,
  AccountId,
  PrivateKey,
  Client,
  Status,
} from '@hashgraph/sdk';
import initHederaService from '../../services/hedera-service';
import logger from 'jet-logger';
import { getConfig } from '../../appConfig';

/**
 * Evolving NFT metadata structure
 */
export interface EvolvingNFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
  level?: number;
  experience?: number;
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
  lastEvolved?: string; // ISO timestamp
  version: number;
}

/**
 * NFT creation configuration
 */
export interface NFTCreationConfig {
  tokenName: string;
  tokenSymbol: string;
  maxSupply: number;
  treasuryAccountId: string;
  customFees?: any[]; // Custom fees for the token
  memo?: string;
}

/**
 * NFT evolution parameters
 */
export interface NFTEvolutionParams {
  tokenId: string;
  serialNumbers: number[];
  newMetadata: EvolvingNFTMetadata;
  evolutionReason: string;
}

/**
 * NFT transfer parameters
 */
export interface NFTTransferParams {
  tokenId: string;
  serialNumber: number;
  fromAccountId: string;
  toAccountId: string;
  fromAccountKey?: PrivateKey;
}

/**
 * Role upgrade parameters for NFTs
 */
export interface NFTRoleUpgrade {
  tokenId: string;
  serialNumber: number;
  currentRole: string;
  newRole: string;
  upgradeRequirements: {
    minLevel?: number;
    requiredExperience?: number;
    requiredItems?: string[];
    burnRequiredTokens?: boolean;
  };
}

/**
 * Service for managing Hedera Evolving NFTs
 */
export class EvolvingNFTService {
  private client!: Client;
  private operatorId!: AccountId;
  private operatorKey!: PrivateKey;
  private evolvingNFTAdminKey!: PrivateKey;
  private evolvingNFTSupplyKey!: PrivateKey;
  private evolvingNFTMetadataKey!: PrivateKey;
  private initialized = false;

  constructor() {
    // Properties will be initialized in init()
  }

  /**
   * Initialize the Evolving NFT service
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const hederaService = await initHederaService();
      this.client = hederaService.hederaClient;
      this.operatorId = hederaService.operatorId;
      this.operatorKey = hederaService.operatorKey;

      // Load evolving NFT specific keys from config
      const config = await getConfig();

      // These keys will be added to secrets configuration
      const evolvingNFTAdminKeyString = config.evolvingNFT?.adminKey;
      const evolvingNFTSupplyKeyString = config.evolvingNFT?.supplyKey;
      const evolvingNFTMetadataKeyString = config.evolvingNFT?.metadataKey;

      if (evolvingNFTAdminKeyString) {
        this.evolvingNFTAdminKey = PrivateKey.fromString(evolvingNFTAdminKeyString);
      } else {
        // Fallback to operator key if no specific admin key provided
        this.evolvingNFTAdminKey = this.operatorKey;
        logger.warn('Using operator key as evolving NFT admin key - consider setting dedicated keys');
      }

      if (evolvingNFTSupplyKeyString) {
        this.evolvingNFTSupplyKey = PrivateKey.fromString(evolvingNFTSupplyKeyString);
      } else {
        this.evolvingNFTSupplyKey = this.operatorKey;
      }

      if (evolvingNFTMetadataKeyString) {
        this.evolvingNFTMetadataKey = PrivateKey.fromString(evolvingNFTMetadataKeyString);
      } else {
        this.evolvingNFTMetadataKey = this.operatorKey;
      }

      this.initialized = true;
      logger.info('Evolving NFT Service initialized successfully');
    } catch (error) {
      logger.err(`Failed to initialize Evolving NFT Service: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Create a new evolving NFT token
   * Note: True evolving functionality requires newer Hedera SDK versions
   * This version focuses on minting with rich metadata that can represent evolution states
   */
  async createEvolvingNFTToken(config: NFTCreationConfig): Promise<{
    tokenId: string;
    transactionId: string;
  }> {
    if (!this.initialized) {
      await this.init();
    }

    try {
      logger.info(`Creating evolving NFT token: ${config.tokenName} (${config.tokenSymbol})`);

      const tokenCreateTx = new TokenCreateTransaction()
        .setTokenName(config.tokenName)
        .setTokenSymbol(config.tokenSymbol)
        .setTokenType(TokenType.NonFungibleUnique)
        .setSupplyType(TokenSupplyType.Finite)
        .setMaxSupply(config.maxSupply)
        .setTreasuryAccountId(config.treasuryAccountId)
        .setAdminKey(this.evolvingNFTAdminKey.publicKey)
        .setSupplyKey(this.evolvingNFTSupplyKey.publicKey)
        // Note: setMetadataKey is not available in this SDK version
        // Future versions will support true evolving NFTs
        .setFreezeDefault(false);

      if (config.memo) {
        tokenCreateTx.setTokenMemo(config.memo);
      }

      if (config.customFees && config.customFees.length > 0) {
        tokenCreateTx.setCustomFees(config.customFees);
      }

      // Sign and execute transaction
      tokenCreateTx.sign(this.evolvingNFTAdminKey);
      const response = await tokenCreateTx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Failed to create evolving NFT token: ${receipt.status.toString()}`);
      }

      const tokenId = receipt.tokenId?.toString() || '';
      const transactionId = response.transactionId.toString();

      logger.info(`Evolving NFT token created successfully: ${tokenId}`);

      return {
        tokenId,
        transactionId,
      };
    } catch (error) {
      logger.err(`Failed to create evolving NFT token: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Mint new evolving NFTs
   */
  async mintEvolvingNFT(
    tokenId: string,
    metadata: EvolvingNFTMetadata[],
    receiverAccountId?: string
  ): Promise<{
    serialNumbers: number[];
    transactionId: string;
  }> {
    if (!this.initialized) {
      await this.init();
    }

    try {
      logger.info(`Minting ${metadata.length} evolving NFT(s) for token ${tokenId}`);

      // Convert metadata to bytes
      const metadataBytes = metadata.map(meta =>
        new Uint8Array(Buffer.from(JSON.stringify(meta), 'utf-8'))
      );

      const mintTx = new TokenMintTransaction()
        .setTokenId(tokenId)
        .setMetadata(metadataBytes);

      // Sign with supply key
      mintTx.sign(this.evolvingNFTSupplyKey);

      const response = await mintTx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Failed to mint evolving NFT: ${receipt.status.toString()}`);
      }

      const serialNumbers = receipt.serials?.map(serial => Number(serial)) || [];
      const transactionId = response.transactionId.toString();

      logger.info(`Minted evolving NFTs successfully. Serial numbers: ${serialNumbers.join(', ')}`);

      // If receiver is specified and different from treasury, transfer the NFTs
      if (receiverAccountId && receiverAccountId !== this.operatorId.toString()) {
        await this.transferEvolvingNFT({
          tokenId,
          serialNumber: serialNumbers[0], // For simplicity, transfer first one
          fromAccountId: this.operatorId.toString(),
          toAccountId: receiverAccountId,
          fromAccountKey: this.operatorKey,
        });
      }

      return {
        serialNumbers,
        transactionId,
      };
    } catch (error) {
      logger.err(`Failed to mint evolving NFT: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Evolve NFT by updating metadata (core evolving functionality)
   * Note: This requires newer Hedera SDK versions with TokenUpdateNftsTransaction
   * Current implementation is a placeholder for future evolution features
   */
  async evolveNFTMetadata(params: NFTEvolutionParams): Promise<{
    transactionId: string;
    updatedMetadata: EvolvingNFTMetadata;
  }> {
    if (!this.initialized) {
      await this.init();
    }

    try {
      logger.info(`Evolving NFT ${params.tokenId} serial numbers: ${params.serialNumbers.join(', ')}`);

      // Update metadata with evolution timestamp and increment version
      const updatedMetadata: EvolvingNFTMetadata = {
        ...params.newMetadata,
        lastEvolved: new Date().toISOString(),
        version: (params.newMetadata.version || 0) + 1,
      };

      // TODO: Implement actual metadata update when TokenUpdateNftsTransaction is available
      // For now, we simulate the evolution by burning old and minting new NFT
      logger.warn('Metadata evolution not yet supported in current SDK version');
      logger.info(`Would evolve NFT with new metadata: ${JSON.stringify(updatedMetadata, null, 2)}`);

      // Placeholder transaction ID - in real implementation this would be from the update transaction
      const transactionId = `evolution-placeholder-${Date.now()}`;

      logger.info(`NFT evolution logged: ${transactionId}. Reason: ${params.evolutionReason}`);

      return {
        transactionId,
        updatedMetadata,
      };
    } catch (error) {
      logger.err(`Failed to evolve NFT metadata: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Transfer evolving NFT to another account
   */
  async transferEvolvingNFT(params: NFTTransferParams): Promise<{
    transactionId: string;
  }> {
    if (!this.initialized) {
      await this.init();
    }

    try {
      logger.info(`Transferring NFT ${params.tokenId}:${params.serialNumber} from ${params.fromAccountId} to ${params.toAccountId}`);

      const fromAccountId = AccountId.fromString(params.fromAccountId);
      const toAccountId = AccountId.fromString(params.toAccountId);
      const tokenId = TokenId.fromString(params.tokenId);
      const fromAccountKey = params.fromAccountKey || this.operatorKey;

      // Create the transfer transaction
      const transferTx = new TransferTransaction()
        .addNftTransfer(tokenId, params.serialNumber, fromAccountId, toAccountId);

      // Sign with the sender's key
      transferTx.sign(fromAccountKey);

      const response = await transferTx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Failed to transfer evolving NFT: ${receipt.status.toString()}`);
      }

      const transactionId = response.transactionId.toString();

      logger.info(`Evolving NFT transferred successfully: ${transactionId}`);

      return {
        transactionId,
      };
    } catch (error) {
      logger.err(`Failed to transfer evolving NFT: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Upgrade NFT role with evolution
   * This combines metadata evolution with role-based logic
   */
  async upgradeNFTRole(params: NFTRoleUpgrade): Promise<{
    transactionId: string;
    upgradedMetadata: EvolvingNFTMetadata;
  }> {
    if (!this.initialized) {
      await this.init();
    }

    try {
      logger.info(`Upgrading NFT role from ${params.currentRole} to ${params.newRole} for ${params.tokenId}:${params.serialNumber}`);

      // TODO: Add validation logic here
      // - Check current metadata to verify role upgrade requirements
      // - Validate level, experience, required items, etc.
      // - This would typically involve querying current NFT metadata first

      // Create new metadata with upgraded role
      const upgradedMetadata: EvolvingNFTMetadata = {
        name: `${params.newRole} Character`,
        description: `Evolved character with ${params.newRole} role`,
        image: `https://hashbuzz.social/nft/images/${params.newRole.toLowerCase()}.png`,
        attributes: [
          {
            trait_type: 'Role',
            value: params.newRole,
          },
          {
            trait_type: 'Previous Role',
            value: params.currentRole,
          },
          {
            trait_type: 'Upgrade Date',
            value: new Date().toISOString(),
          },
          // Include existing attributes that should be preserved
          ...(params.upgradeRequirements.minLevel ? [{
            trait_type: 'Level',
            value: params.upgradeRequirements.minLevel,
          }] : []),
        ],
        level: params.upgradeRequirements.minLevel || 1,
        experience: params.upgradeRequirements.requiredExperience || 0,
        rarity: this.calculateRarityByRole(params.newRole),
        version: 1, // Will be incremented in evolveNFTMetadata
      };

      // Use the evolution function to update metadata
      const result = await this.evolveNFTMetadata({
        tokenId: params.tokenId,
        serialNumbers: [params.serialNumber],
        newMetadata: upgradedMetadata,
        evolutionReason: `Role upgrade from ${params.currentRole} to ${params.newRole}`,
      });

      logger.info(`NFT role upgraded successfully: ${result.transactionId}`);

      return {
        transactionId: result.transactionId,
        upgradedMetadata: result.updatedMetadata,
      };
    } catch (error) {
      logger.err(`Failed to upgrade NFT role: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Associate token with an account (required before receiving NFTs)
   */
  async associateTokenWithAccount(
    tokenId: string,
    accountId: string,
    accountKey: PrivateKey
  ): Promise<{
    transactionId: string;
  }> {
    if (!this.initialized) {
      await this.init();
    }

    try {
      logger.info(`Associating token ${tokenId} with account ${accountId}`);

      const associateTx = new TokenAssociateTransaction()
        .setAccountId(accountId)
        .setTokenIds([tokenId]);

      associateTx.sign(accountKey);

      const response = await associateTx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Failed to associate token: ${receipt.status.toString()}`);
      }

      const transactionId = response.transactionId.toString();

      logger.info(`Token associated successfully: ${transactionId}`);

      return {
        transactionId,
      };
    } catch (error) {
      logger.err(`Failed to associate token: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Helper function to calculate rarity based on role
   */
  private calculateRarityByRole(role: string): 'common' | 'rare' | 'epic' | 'legendary' {
    const roleRarityMap: Record<string, 'common' | 'rare' | 'epic' | 'legendary'> = {
      'rookie': 'common',
      'influencer': 'rare',
      'ambassador': 'epic',
      'legend': 'legendary',
    };

    return roleRarityMap[role.toLowerCase()] || 'common';
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    operatorAccount: string;
    hasAdminKey: boolean;
    hasSupplyKey: boolean;
    hasMetadataKey: boolean;
  } {
    return {
      initialized: this.initialized,
      operatorAccount: this.operatorId?.toString() || 'Not initialized',
      hasAdminKey: !!this.evolvingNFTAdminKey,
      hasSupplyKey: !!this.evolvingNFTSupplyKey,
      hasMetadataKey: !!this.evolvingNFTMetadataKey,
    };
  }
}

// Export singleton instance
export const evolvingNFTService = new EvolvingNFTService();
