import { campaign_twittercard, campaignstatus } from '@prisma/client';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import {
  EligibilityCheckResult,
  EligibilityCheckPayload,
  CampaignExpiryOperationError
} from '../types';

// =============================================================================
// ELIGIBILITY CHECKING SERVICE
// =============================================================================

/**
 * Functional service to check if a campaign is eligible for expiry processing
 * Self-dependent: fetches required data from database as needed
 */
export class CampaignEligibilityChecker {
  /**
   * Main eligibility check function
   * Determines if a campaign can proceed with expiry processing
   */
  static async checkEligibility(payload: EligibilityCheckPayload): Promise<EligibilityCheckResult> {
    const { context, campaign: providedCampaign } = payload;
    const { campaignId, requestId } = context;

    try {
      logger.info(`[${requestId}] Starting eligibility check for campaign ${campaignId}`);

      // Fetch fresh campaign data if not provided
      const campaign = providedCampaign || await this.fetchCampaignData(campaignId, requestId);
      
      if (!campaign) {
        return {
          isEligible: false,
          reason: 'Campaign not found',
          blockers: ['CAMPAIGN_NOT_FOUND']
        };
      }

      // Perform all eligibility checks
      const checks = await Promise.all([
        this.checkCampaignStatus(campaign, requestId),
        this.checkExpiryTime(campaign, requestId),
        this.checkContractStatus(campaign, requestId),
        this.checkBalanceStatus(campaign, requestId),
        this.checkPendingOperations(campaign, requestId)
      ]);

      // Aggregate results
      const blockers: string[] = [];
      let isEligible = true;
      let reason = '';

      checks.forEach(check => {
        if (!check.isEligible) {
          isEligible = false;
          if (check.reason) {
            reason = reason ? `${reason}; ${check.reason}` : check.reason;
          }
          if (check.blockers) {
            blockers.push(...check.blockers);
          }
        }
      });

      const result: EligibilityCheckResult = {
        isEligible,
        campaign,
        currentStatus: campaign.card_status,
        expiryTime: campaign.campaign_expiry || undefined,
        ...(reason && { reason }),
        ...(blockers.length > 0 && { blockers })
      };

      logger.info(`[${requestId}] Eligibility check completed - Eligible: ${String(isEligible)}`);
      if (!isEligible) {
        logger.warn(`[${requestId}] Campaign ${String(campaignId)} not eligible: ${reason}`);
      }

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`[${requestId}] Eligibility check failed for campaign ${campaignId}: ${errorMsg}`);
      
      throw new CampaignExpiryOperationError(
        `Eligibility check failed: ${errorMsg}`,
        'ELIGIBILITY_CHECK_ERROR',
        campaignId,
        requestId,
        'eligibility-check',
        { originalError: error }
      );
    }
  }

  /**
   * Fetch campaign data from database
   */
  private static async fetchCampaignData(
    campaignId: bigint, 
    requestId: string
  ): Promise<campaign_twittercard | null> {
    try {
      const prisma = await createPrismaClient();
      
      const campaign = await prisma.campaign_twittercard.findUnique({
        where: { id: campaignId }
      });

      logger.info(`[${requestId}] Fetched campaign data for ${campaignId}`);
      return campaign;

    } catch (error) {
      logger.err(`[${requestId}] Failed to fetch campaign ${String(campaignId)}: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Check if campaign status allows expiry processing
   */
  private static async checkCampaignStatus(
    campaign: campaign_twittercard, 
    requestId: string
  ): Promise<EligibilityCheckResult> {
    const validStatuses: campaignstatus[] = [
      campaignstatus.CampaignRunning,
      campaignstatus.RewardDistributionInProgress,
      campaignstatus.RewardsDistributed
    ];

    const isValid = validStatuses.includes(campaign.card_status);

    return {
      isEligible: isValid,
      reason: isValid ? undefined : `Invalid status: ${campaign.card_status}`,
      blockers: isValid ? undefined : ['INVALID_STATUS'],
      currentStatus: campaign.status
    };
  }

  /**
   * Check if campaign has reached expiry time
   */
  private static async checkExpiryTime(
    campaign: campaign_twittercard, 
    requestId: string
  ): Promise<EligibilityCheckResult> {
    if (!campaign.campaign_expiry) {
      return {
        isEligible: false,
        reason: 'No end date set',
        blockers: ['NO_END_DATE']
      };
    }

    const now = new Date();
    const endDate = new Date(campaign.campaign_expiry);
    const hasExpired = now >= endDate;

    // Allow some grace period (e.g., 5 minutes early) for processing
    const gracePeriod = 5 * 60 * 1000; // 5 minutes in milliseconds
    const canProcess = (now.getTime() + gracePeriod) >= endDate.getTime();

    return {
      isEligible: canProcess,
      reason: canProcess ? undefined : `Campaign not yet expired (ends: ${endDate.toISOString()})`,
      blockers: canProcess ? undefined : ['NOT_EXPIRED'],
      expiryTime: endDate
    };
  }

  /**
   * Check contract-related status
   */
  private static async checkContractStatus(
    campaign: campaign_twittercard, 
    requestId: string
  ): Promise<EligibilityCheckResult> {
    if (!campaign.contract_id) {
      return {
        isEligible: false,
        reason: 'No contract ID found',
        blockers: ['NO_CONTRACT_ID']
      };
    }

    // Additional contract validation could be added here
    // e.g., checking if contract is still active on Hedera

    return {
      isEligible: true
    };
  }

  /**
   * Check campaign balance and payment status
   */
  private static async checkBalanceStatus(
    campaign: campaign_twittercard, 
    requestId: string
  ): Promise<EligibilityCheckResult> {
    try {
      const prisma = await createPrismaClient();

      // Check if there are unpaid rewards or pending transactions
      const pendingPayments = await prisma.campaign_twittercard.findUnique({
        where: { id: campaign.id },
        select: {
          campaign_budget: true,
          amount_spent: true,
          amount_claimed: true
        }
      });

      if (!pendingPayments) {
        return {
          isEligible: false,
          reason: 'Cannot fetch payment status',
          blockers: ['PAYMENT_STATUS_UNKNOWN']
        };
      }

      // Check if campaign has budget remaining for rewards
      const campaignBudget = pendingPayments.campaign_budget || 0;
      const amountSpent = pendingPayments.amount_spent || 0;
      const remainingBudget = campaignBudget - amountSpent;
      
      if (remainingBudget <= 0) {
        return {
          isEligible: false,
          reason: 'No remaining budget for rewards',
          blockers: ['NO_REMAINING_BUDGET']
        };
      }

      return {
        isEligible: true
      };

    } catch (error) {
      logger.err(`[${requestId}] Balance status check failed: ${error}`);
      return {
        isEligible: false,
        reason: 'Failed to check balance status',
        blockers: ['BALANCE_CHECK_FAILED']
      };
    }
  }

  /**
   * Check for any pending operations that would block expiry
   */
  private static async checkPendingOperations(
    campaign: campaign_twittercard, 
    requestId: string
  ): Promise<EligibilityCheckResult> {
    try {
      const prisma = await createPrismaClient();

      // Check for pending transactions
      const pendingTransactions = await prisma.transactionRecord.count({
        where: {
          campaign_id: campaign.id,
          status: 'PENDING'
        }
      });

      if (pendingTransactions > 0) {
        return {
          isEligible: false,
          reason: `${pendingTransactions} pending transactions`,
          blockers: ['PENDING_TRANSACTIONS']
        };
      }

      // Check for ongoing engagement collection
      const ongoingCollection = await prisma.campaignLog.findFirst({
        where: {
          campaign_id: campaign.id,
          status: 'COLLECTING_ENGAGEMENTS',
          created_at: {
            gte: new Date(Date.now() - 60 * 60 * 1000) // Within last hour
          }
        }
      });

      if (ongoingCollection) {
        return {
          isEligible: false,
          reason: 'Engagement collection in progress',
          blockers: ['ENGAGEMENT_COLLECTION_IN_PROGRESS']
        };
      }

      return {
        isEligible: true
      };

    } catch (error) {
      logger.err(`[${requestId}] Pending operations check failed: ${error}`);
      return {
        isEligible: false,
        reason: 'Failed to check pending operations',
        blockers: ['PENDING_OPERATIONS_CHECK_FAILED']
      };
    }
  }

  /**
   * Force eligibility check - bypasses some safety checks
   * Use with caution for administrative overrides
   */
  static async forceEligibilityCheck(payload: EligibilityCheckPayload): Promise<EligibilityCheckResult> {
    const { context, campaign: providedCampaign } = payload;
    const { campaignId, requestId } = context;

    try {
      logger.warn(`[${requestId}] FORCE eligibility check for campaign ${campaignId}`);

      const campaign = providedCampaign || await this.fetchCampaignData(campaignId, requestId);
      
      if (!campaign) {
        return {
          isEligible: false,
          reason: 'Campaign not found',
          blockers: ['CAMPAIGN_NOT_FOUND']
        };
      }

      // Only check critical blockers for force mode
      const contractCheck = await this.checkContractStatus(campaign, requestId);
      
      if (!contractCheck.isEligible) {
        return contractCheck;
      }

      logger.warn(`[${requestId}] Force eligibility approved for campaign ${campaignId}`);
      
      return {
        isEligible: true,
        campaign,
        currentStatus: campaign.card_status,
        expiryTime: campaign.campaign_expiry || undefined,
        reason: 'Force approved'
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`[${requestId}] Force eligibility check failed: ${errorMsg}`);
      
      throw new CampaignExpiryOperationError(
        `Force eligibility check failed: ${errorMsg}`,
        'FORCE_ELIGIBILITY_CHECK_ERROR',
        campaignId,
        requestId,
        'eligibility-check',
        { originalError: error }
      );
    }
  }
}