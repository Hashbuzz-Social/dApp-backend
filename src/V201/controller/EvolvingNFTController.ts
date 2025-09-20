import { Request, Response } from 'express';
import { evolvingNFTService } from '../services/evolvingNFTService';
import logger from 'jet-logger';
import { PrivateKey } from '@hashgraph/sdk';

/**
 * Controller for Evolving NFT operations
 */
export class EvolvingNFTController {
  /**
   * Create a new evolving NFT token
   */
  async createToken(req: Request, res: Response): Promise<void> {
    try {
      const { tokenName, tokenSymbol, maxSupply, treasuryAccountId, memo } = req.body;

      if (!tokenName || !tokenSymbol || !maxSupply || !treasuryAccountId) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: tokenName, tokenSymbol, maxSupply, treasuryAccountId',
        });
        return;
      }

      const result = await evolvingNFTService.createEvolvingNFTToken({
        tokenName,
        tokenSymbol,
        maxSupply: Number(maxSupply),
        treasuryAccountId,
        memo: memo || `HashBuzz Evolving NFT - ${tokenName}`,
      });

      res.json({
        success: true,
        data: result,
        message: 'Evolving NFT token created successfully',
      });
    } catch (error) {
      logger.err(`Failed to create evolving NFT token: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({
        success: false,
        message: 'Failed to create evolving NFT token',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Mint new evolving NFTs
   */
  async mintNFT(req: Request, res: Response): Promise<void> {
    try {
      const { tokenId, metadata, receiverAccountId } = req.body;

      if (!tokenId || !metadata) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: tokenId, metadata',
        });
        return;
      }

      // Ensure metadata is an array
      const metadataArray = Array.isArray(metadata) ? metadata : [metadata];

      const result = await evolvingNFTService.mintEvolvingNFT(
        tokenId,
        metadataArray,
        receiverAccountId
      );

      res.json({
        success: true,
        data: result,
        message: 'Evolving NFTs minted successfully',
      });
    } catch (error) {
      logger.err(`Failed to mint evolving NFTs: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({
        success: false,
        message: 'Failed to mint evolving NFTs',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Evolve NFT metadata (placeholder implementation)
   */
  async evolveNFT(req: Request, res: Response): Promise<void> {
    try {
      const { tokenId, serialNumbers, newMetadata, evolutionReason } = req.body;

      if (!tokenId || !serialNumbers || !newMetadata || !evolutionReason) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: tokenId, serialNumbers, newMetadata, evolutionReason',
        });
        return;
      }

      const result = await evolvingNFTService.evolveNFTMetadata({
        tokenId,
        serialNumbers: Array.isArray(serialNumbers) ? serialNumbers : [serialNumbers],
        newMetadata,
        evolutionReason,
      });

      res.json({
        success: true,
        data: result,
        message: 'NFT evolution processed (placeholder implementation)',
      });
    } catch (error) {
      logger.err(`Failed to evolve NFT: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({
        success: false,
        message: 'Failed to evolve NFT',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Transfer evolving NFT
   */
  async transferNFT(req: Request, res: Response): Promise<void> {
    try {
      const { tokenId, serialNumber, fromAccountId, toAccountId, fromAccountKeyString } = req.body;

      if (!tokenId || !serialNumber || !fromAccountId || !toAccountId) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: tokenId, serialNumber, fromAccountId, toAccountId',
        });
        return;
      }

      let fromAccountKey;
      if (fromAccountKeyString) {
        try {
          fromAccountKey = PrivateKey.fromString(fromAccountKeyString);
        } catch {
          res.status(400).json({
            success: false,
            message: 'Invalid private key format',
          });
          return;
        }
      }

      const result = await evolvingNFTService.transferEvolvingNFT({
        tokenId,
        serialNumber: Number(serialNumber),
        fromAccountId,
        toAccountId,
        fromAccountKey,
      });

      res.json({
        success: true,
        data: result,
        message: 'Evolving NFT transferred successfully',
      });
    } catch (error) {
      logger.err(`Failed to transfer evolving NFT: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({
        success: false,
        message: 'Failed to transfer evolving NFT',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Upgrade NFT role
   */
  async upgradeRole(req: Request, res: Response): Promise<void> {
    try {
      const {
        tokenId,
        serialNumber,
        currentRole,
        newRole,
        upgradeRequirements = {}
      } = req.body;

      if (!tokenId || !serialNumber || !currentRole || !newRole) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: tokenId, serialNumber, currentRole, newRole',
        });
        return;
      }

      const result = await evolvingNFTService.upgradeNFTRole({
        tokenId,
        serialNumber: Number(serialNumber),
        currentRole,
        newRole,
        upgradeRequirements,
      });

      res.json({
        success: true,
        data: result,
        message: 'NFT role upgraded successfully',
      });
    } catch (error) {
      logger.err(`Failed to upgrade NFT role: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({
        success: false,
        message: 'Failed to upgrade NFT role',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Associate token with account
   */
  async associateToken(req: Request, res: Response): Promise<void> {
    try {
      const { tokenId, accountId, accountKeyString } = req.body;

      if (!tokenId || !accountId || !accountKeyString) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: tokenId, accountId, accountKeyString',
        });
        return;
      }

      let accountKey;
      try {
        accountKey = PrivateKey.fromString(accountKeyString);
      } catch {
        res.status(400).json({
          success: false,
          message: 'Invalid private key format',
        });
        return;
      }

      const result = await evolvingNFTService.associateTokenWithAccount(
        tokenId,
        accountId,
        accountKey
      );

      res.json({
        success: true,
        data: result,
        message: 'Token associated with account successfully',
      });
    } catch (error) {
      logger.err(`Failed to associate token: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({
        success: false,
        message: 'Failed to associate token',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get service status
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = evolvingNFTService.getStatus();

      res.json({
        success: true,
        data: status,
        message: 'Evolving NFT service status retrieved successfully',
      });
    } catch (error) {
      logger.err(`Failed to get service status: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({
        success: false,
        message: 'Failed to get service status',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const evolvingNFTController = new EvolvingNFTController();
