import { Router } from 'express';
import { evolvingNFTController } from '../controller/EvolvingNFTController';

const evolvingNFTRouter = Router();

/**
 * @route POST /api/v201/evolving-nft/create-token
 * @desc Create a new evolving NFT token
 * @access Private (Admin only - should be protected by auth middleware)
 */
evolvingNFTRouter.post('/create-token', (req, res) => evolvingNFTController.createToken(req, res));

/**
 * @route POST /api/v201/evolving-nft/mint
 * @desc Mint new evolving NFTs
 * @access Private
 */
evolvingNFTRouter.post('/mint', (req, res) => evolvingNFTController.mintNFT(req, res));

/**
 * @route POST /api/v201/evolving-nft/evolve
 * @desc Evolve NFT metadata (placeholder implementation)
 * @access Private
 */
evolvingNFTRouter.post('/evolve', (req, res) => evolvingNFTController.evolveNFT(req, res));

/**
 * @route POST /api/v201/evolving-nft/transfer
 * @desc Transfer evolving NFT to another account
 * @access Private
 */
evolvingNFTRouter.post('/transfer', (req, res) => evolvingNFTController.transferNFT(req, res));

/**
 * @route POST /api/v201/evolving-nft/upgrade-role
 * @desc Upgrade NFT role with evolution
 * @access Private
 */
evolvingNFTRouter.post('/upgrade-role', (req, res) => evolvingNFTController.upgradeRole(req, res));

/**
 * @route POST /api/v201/evolving-nft/associate-token
 * @desc Associate token with an account
 * @access Private
 */
evolvingNFTRouter.post('/associate-token', (req, res) => evolvingNFTController.associateToken(req, res));

/**
 * @route GET /api/v201/evolving-nft/status
 * @desc Get evolving NFT service status
 * @access Private
 */
evolvingNFTRouter.get('/status', (req, res) => evolvingNFTController.getStatus(req, res));

export default evolvingNFTRouter;
