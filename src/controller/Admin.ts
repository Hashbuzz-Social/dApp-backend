import { getConfig } from '@appConfig';
import { Status } from '@hashgraph/sdk';
import {
  campaignstatus as CampaignStatus,
  transactionType,
  network,
} from '@prisma/client';
import CampaignLifeCycleBase from '@services/CampaignLifeCycleBase';
import { provideActiveContract } from '@services/contract-service';
import ContractUtils from '@services/ContractUtilsHandlers';
import initHederaService from '@services/hedera-service';
import HederaSDKCalls from '@services/HederaSDKCalls';
import { default as htsServices } from '@services/hts-services';
import { MediaService } from '@services/media-service';
import passwordService from '@services/password-service';
import twitterCardService from '@services/twitterCard-service';
import { ErrorWithCode } from '@shared/errors';
import { sensitizeUserData } from '@shared/helper';
import NetworkHelpers from '@shared/NetworkHelpers';
import createPrismaClient from '@shared/prisma';
import { NextFunction, Request, Response } from 'express';
import statuses from 'http-status-codes';
import JSONBigInt from 'json-bigint';
import { isEmpty } from 'lodash';
import { TokenData } from 'src/@types/networkResponses';

const { OK, BAD_REQUEST, NOT_FOUND } = statuses;

export const handleGetAllCard = async (req: Request, res: Response) => {
  const status = req.query.status as any as CampaignStatus;
  const data = await twitterCardService.getAllTwitterCardByStatus(status);
  if (data && data.length > 0) {
    return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(data)));
  } else res.status(OK).json([]);
};

export const handleGetAllCardPendingCards = async (
  req: Request,
  res: Response
) => {
  const data = await twitterCardService.getAllTwitterCardPendingCards();
  if (data && data.length > 0) {
    const mediaservice = new MediaService();
    await mediaservice.initialize();

    const dataWithMedia = await Promise.all(
      data.map(async (card) => {
        if (card.media && card.media.length > 0) {
          card.media = await Promise.all(
            card.media.map(async (mediaKey) => {
              return await mediaservice.getSignedUrl(mediaKey);
            })
          );
        }
        return card;
      })
    );

    return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(dataWithMedia)));
  } else {
    return res.status(OK).json([]);
  }
};

export const handleUpdateCard = async (req: Request, res: Response) => {
  const approve = req.body.approve as boolean;
  const id = req.body.id as number;

  const data = await twitterCardService.updateStatus(id, approve);
  return res.status(OK).json({
    message: 'Status updated successfully',
    data: JSONBigInt.parse(JSONBigInt.stringify(data)),
  });
};

export const handleUpdatePasswordReq = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { password, oldPassword }: { password: string; oldPassword?: string } =
    req.body;
  const prisma = await createPrismaClient();
  if (req.currentUser?.salt && req.currentUser.hash && isEmpty(oldPassword)) {
    next(
      new ErrorWithCode(
        'without old password password reset is not allowed',
        BAD_REQUEST
      )
    );
  }

  // Update normal password.

  if (
    oldPassword &&
    password &&
    req.currentUser?.salt &&
    req.currentUser.hash
  ) {
    //?? match the old password.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const matchOldPassword = passwordService.validPassword(
      oldPassword,
      req.currentUser.salt,
      req.currentUser.hash
    );
    //!! if not matched throw error
    if (!matchOldPassword)
      next(new ErrorWithCode('Old password is not matching', BAD_REQUEST));

    //old password is match now generate salt and hash for given password.
    const { salt, hash } = passwordService.createPassword(password);
    await prisma.user_user.update({
      where: { id: req.currentUser.id },
      data: {
        salt,
        hash,
      },
    });

    return res.status(OK).json({ message: 'Password updated successfully.' });
  }

  //!! reset password for newly created admin.
  if (
    req.currentUser?.id &&
    !req.currentUser?.salt &&
    !req.currentUser?.hash &&
    password
  ) {
    // create new password key and salt
    const { salt, hash } = passwordService.createPassword(password);
    //!! Save to db.
    const updatedUser = await prisma.user_user.update({
      where: { id: req.currentUser?.id },
      data: {
        salt,
        hash,
      },
    });

    const szUser = await sensitizeUserData(updatedUser);

    return res.status(OK).json({
      message: 'Password created successfully.',
      user: JSONBigInt.parse(JSONBigInt.stringify(szUser)),
    });
  }

  res.status(BAD_REQUEST).json({ message: 'Handler function not found' });
};

export const handleTokenInfoReq = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const tokenId = req.body.tokenId as string;
  const tokenInfo = await htsServices.getTokenInfo(tokenId);
  return res.status(OK).json(tokenInfo);
};

export const handleWhiteListToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const prisma = await createPrismaClient();
  const config = await getConfig();
  try {
    const tokenId = req.body.token_id as string;

    const tokenType = req.body.token_type as string;
    const userId = req.currentUser?.id;
    const tokenSymbol = req.body.token_symbol as string;
    const decimals = req.body.decimals as number;

    if (
      !tokenId ||
      !tokenType ||
      !userId ||
      !tokenSymbol ||
      decimals === undefined
    ) {
      return res
        .status(BAD_REQUEST)
        .json({ message: 'Missing required fields' });
    }

    const contractDetails = await provideActiveContract();
    const networkHelpers = new NetworkHelpers(config.app.mirrorNodeURL);
    const tokenData = await networkHelpers.getTokenDetails<TokenData>(tokenId);

    if (
      !contractDetails?.contract_id ||
      !tokenData ||
      tokenData.type !== 'FUNGIBLE_COMMON'
    ) {
      return res
        .status(BAD_REQUEST)
        .json({ message: 'Invalid contract details or token data' });
    }

    const existingToken = await prisma.whiteListedTokens.findUnique({
      where: { token_id: tokenId },
    });

    if (existingToken) {
      return res
        .status(BAD_REQUEST)
        .json({ message: 'Token already associated.' });
    }
    const utilsHandlerService = new ContractUtils(contractDetails.contract_id);
    // Lodge in the contract.
    const response = await utilsHandlerService.associateToken(tokenId, true);

    if (response._code !== Status.Success._code) {
      return res
        .status(BAD_REQUEST)
        .json({ message: 'Token association SM update failed' });
    }

    // SDK call to associate token with account
    const { hederaClient, operatorKey, operatorId } = await initHederaService();
    const hederaSDKCallHandler = new HederaSDKCalls(
      hederaClient,
      operatorId,
      operatorKey
    );
    const associateTokenResponse = await hederaSDKCallHandler.associateToken(
      contractDetails.contract_id,
      tokenId
    );

    if (associateTokenResponse !== Status.Success) {
      return res
        .status(BAD_REQUEST)
        .json({ message: 'Token association failed' });
    }

    const newToken = await prisma.whiteListedTokens.upsert({
      where: { token_id: tokenId },
      create: {
        name: tokenData.name,
        token_id: tokenId,
        tokendata: JSON.parse(JSON.stringify(tokenData)),
        token_type: tokenType,
        added_by: userId,
        token_symbol: tokenSymbol,
        decimals,
        contract_id: contractDetails.contract_id.toString(),
      },
      update: {
        token_id: tokenId,
        tokendata: JSON.parse(JSON.stringify(tokenData)),
      },
    });

    return res.status(OK).json({
      message: 'Token added successfully',
      data: JSONBigInt.parse(JSONBigInt.stringify(newToken)),
    });
  } catch (error) {
    console.error('Error in handleWhiteListToken:', error);
    return res.status(BAD_REQUEST).json({ message: 'Something went wrong.' });
  }
};

export const handleGetAllWLToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const prisma = await createPrismaClient();
  const tokenId = req.query.tokenId as any as string;
  if (tokenId) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const tokenData = await prisma.whiteListedTokens.findUnique({
      where: { token_id: tokenId },
    });
    return res.status(OK).json({
      tokenId,
      data: JSONBigInt.parse(JSONBigInt.stringify(tokenData)),
    });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const allTokens = await prisma.whiteListedTokens.findMany();
    return res.status(OK).json({
      data: JSONBigInt.parse(JSONBigInt.stringify(allTokens)),
    });
  }
};

export const handleGetCmapingLogs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const cmapignId = req.params.id as any as number;
    const instance = await CampaignLifeCycleBase.create(cmapignId);
    const data = await instance.getLogsOfTheCampaign();
    res.status(OK).json({
      success: true,
      data,
      message: 'Cmapaing logs found successfully',
    });
  } catch (err) {
    next(err);
  }
};

export const handleAllowAsCampaigner = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const prisma = await createPrismaClient();
  try {
    const id = req.body.id as number;
    if (!id)
      return res.status(BAD_REQUEST).json({ message: 'User id not found.' });
    const updatedUser = await prisma.user_user.update({
      data: { role: 'USER' },
      where: { id },
    });
    const szUser = await sensitizeUserData(updatedUser);
    return res.status(OK).json({
      success: true,
      user: JSONBigInt.parse(JSONBigInt.stringify(szUser)),
    });
  } catch (err) {
    next(err);
  }
};

export const handleGetAllCampaigns = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    res.status(OK).json({});
  } catch (err) {
    next(err);
  }
};

export const handleDeleteBizHanlde = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const prisma = await createPrismaClient();
  try {
    const userId = req.body.userId as number;

    // Check if the user exists
    const user = await prisma.user_user.findUnique({
      where: { id: Number(userId) },
    });

    if (!user) {
      return res.status(NOT_FOUND).json({ message: 'User not found' });
    }

    // Update specific fields to null
    const updatedUser = await prisma.user_user.update({
      where: { id: Number(userId) },
      data: {
        business_twitter_handle: null,
        business_twitter_access_token: null,
        business_twitter_access_token_secret: null,
      },
    });

    return res.status(200).json({
      message: 'User buiesness handle removed successfully',
      data: JSONBigInt.parse(
        JSONBigInt.stringify(await sensitizeUserData(updatedUser))
      ),
    });
  } catch (err) {
    next(err); // Pass error to the error handling middleware
  }
};

export const handleDeletePerosnalHanlde = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const prisma = await createPrismaClient();
  try {
    const userId = req.body.userId as number;

    // Check if the user exists
    const user = await prisma.user_user.findUnique({
      where: { id: Number(userId) },
    });

    if (!user) {
      return res.status(NOT_FOUND).json({ message: 'User not found' });
    }

    // Update specific fields to null
    const updatedUser = await prisma.user_user.update({
      where: { id: Number(userId) },
      data: {
        personal_twitter_handle: null,
        personal_twitter_id: null,
        profile_image_url: '',
        twitter_access_token: null,
        twitter_access_token_secret: null,
      },
    });

    return res.status(200).json({
      message: 'User buiesness handle removed successfully',
      data: JSONBigInt.parse(
        JSONBigInt.stringify(await sensitizeUserData(updatedUser))
      ),
    });
  } catch (err) {
    next(err); // Pass error to the error handling middleware
  }
};

export const handleGetTrailsettters = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Path to Key Store
    const prisma = await createPrismaClient();
    const trailsettersData = await prisma.trailsetters.findMany();
    return res
      .status(OK)
      .json(JSONBigInt.parse(JSONBigInt.stringify(trailsettersData)));
  } catch (err) {
    next(err);
  }
};

export const updateTrailsettersData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const waletId = req.body.accounts[0];

    if (!waletId) {
      return res.status(BAD_REQUEST).json({ message: 'Wallet id not found' });
    }
    const prisma = await createPrismaClient();

    // is this wallet is already onborades
    const isAlreadyOnboarded = await prisma.user_user.findUnique({
      where: { hedera_wallet_id: waletId },
    });

    await prisma.trailsetters.create({
      data: { walletId: req.body.accounts[0] },
    });
    if (isAlreadyOnboarded) {
      await prisma.user_user.update({
        where: { hedera_wallet_id: waletId },
        data: { role: 'TRAILSETTER' },
      });
    }
    const trailsettersData = await prisma.trailsetters.findMany();
    return res.created(
      JSONBigInt.parse(JSONBigInt.stringify(trailsettersData)),
      'Trailsetters added successfuly'
    );
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// TRANSACTION MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Get all transactions with filtering and pagination
 */
export const handleGetAllTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = await createPrismaClient();

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const transaction_type = req.query.transaction_type as string;
    const network = req.query.network as string;
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = {};
    if (status) where.status = status;
    if (transaction_type) where.transaction_type = transaction_type;
    if (network) where.network = network;

    // Get transactions with pagination
    const [transactions, totalCount] = await Promise.all([
      prisma.transactions.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transactions.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(OK).json({
      data: JSONBigInt.parse(JSONBigInt.stringify(transactions)),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get transaction by ID
 */
export const handleGetTransactionById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = await createPrismaClient();
    const transactionId = req.params.id;

    const transaction = await prisma.transactions.findUnique({
      where: { id: BigInt(transactionId) },
    });

    if (!transaction) {
      return res.status(NOT_FOUND).json({
        message: 'Transaction not found',
      });
    }

    return res.status(OK).json({
      data: JSONBigInt.parse(JSONBigInt.stringify(transaction)),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update transaction status
 */
export const handleUpdateTransactionStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = await createPrismaClient();
    const { id, status } = req.body;

    // Validate status values
    const validStatuses = ['pending', 'completed', 'failed', 'cancelled', 'processing'];
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(BAD_REQUEST).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const transaction = await prisma.transactions.findUnique({
      where: { id: BigInt(id) },
    });

    if (!transaction) {
      return res.status(NOT_FOUND).json({
        message: 'Transaction not found',
      });
    }

    const updatedTransaction = await prisma.transactions.update({
      where: { id: BigInt(id) },
      data: {
        status: status.toLowerCase(),
      },
    });

    return res.status(OK).json({
      message: 'Transaction status updated successfully',
      data: JSONBigInt.parse(JSONBigInt.stringify(updatedTransaction)),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get transaction statistics
 */
export const handleGetTransactionStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = await createPrismaClient();

    // Get basic statistics
    const [
      totalTransactions,
      pendingTransactions,
      completedTransactions,
      failedTransactions,
      totalAmount,
      transactionsByType,
      transactionsByNetwork,
    ] = await Promise.all([
      prisma.transactions.count(),
      prisma.transactions.count({ where: { status: 'pending' } }),
      prisma.transactions.count({ where: { status: 'completed' } }),
      prisma.transactions.count({ where: { status: 'failed' } }),
      prisma.transactions.aggregate({
        _sum: { amount: true },
        where: { status: 'completed' },
      }),
      prisma.transactions.groupBy({
        by: ['transaction_type'],
        _count: { transaction_type: true },
        _sum: { amount: true },
      }),
      prisma.transactions.groupBy({
        by: ['network'],
        _count: { network: true },
        _sum: { amount: true },
      }),
    ]);

    return res.status(OK).json({
      data: {
        overview: {
          totalTransactions,
          pendingTransactions,
          completedTransactions,
          failedTransactions,
          totalAmount: totalAmount._sum.amount || 0,
        },
        byType: transactionsByType.map(item => ({
          type: item.transaction_type,
          count: item._count.transaction_type,
          totalAmount: item._sum.amount || 0,
        })),
        byNetwork: transactionsByNetwork.map(item => ({
          network: item.network,
          count: item._count.network,
          totalAmount: item._sum.amount || 0,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get recent transaction activity
 */
export const handleGetRecentTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = await createPrismaClient();
    const limit = parseInt(req.query.limit as string) || 10;

    const recentTransactions = await prisma.transactions.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        transaction_id: true,
        transaction_type: true,
        network: true,
        amount: true,
        status: true,
        created_at: true,
      },
    });

    return res.status(OK).json({
      data: JSONBigInt.parse(JSONBigInt.stringify(recentTransactions)),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete transaction (soft delete by updating status)
 */
export const handleDeleteTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = await createPrismaClient();
    const transactionId = req.params.id;

    const transaction = await prisma.transactions.findUnique({
      where: { id: BigInt(transactionId) },
    });

    if (!transaction) {
      return res.status(NOT_FOUND).json({
        message: 'Transaction not found',
      });
    }

    // Soft delete by updating status to 'deleted'
    const deletedTransaction = await prisma.transactions.update({
      where: { id: BigInt(transactionId) },
      data: { status: 'deleted' },
    });

    return res.status(OK).json({
      message: 'Transaction deleted successfully',
      data: JSONBigInt.parse(JSONBigInt.stringify(deletedTransaction)),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Retry failed transaction
 */
export const handleRetryTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = await createPrismaClient();
    const transactionId = req.params.id;

    const transaction = await prisma.transactions.findUnique({
      where: { id: BigInt(transactionId) },
    });

    if (!transaction) {
      return res.status(NOT_FOUND).json({
        message: 'Transaction not found',
      });
    }

    if (transaction.status !== 'failed') {
      return res.status(BAD_REQUEST).json({
        message: 'Only failed transactions can be retried',
      });
    }

    // Update status to pending for retry
    const retriedTransaction = await prisma.transactions.update({
      where: { id: BigInt(transactionId) },
      data: {
        status: 'pending',
        // Update transaction_data to include retry information
        transaction_data: {
          ...transaction.transaction_data as any,
          retryCount: ((transaction.transaction_data as any)?.retryCount || 0) + 1,
          retriedAt: new Date().toISOString(),
        },
      },
    });

    return res.status(OK).json({
      message: 'Transaction marked for retry successfully',
      data: JSONBigInt.parse(JSONBigInt.stringify(retriedTransaction)),
    });
  } catch (err) {
    next(err);
  }
};
