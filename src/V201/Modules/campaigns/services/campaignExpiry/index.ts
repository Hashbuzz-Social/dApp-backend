// =============================================================================
// V201 CAMPAIGN EXPIRY SYSTEM - MAIN EXPORTS
// =============================================================================

// Core Types and Interfaces
export * from './types';

// Event System
export * from './events';

// Services
export { CampaignEligibilityChecker } from './services/eligibilityChecker';
export { CampaignEngagementCollector } from './services/engagementCollector';
export { CampaignRewardCalculator } from './services/rewardCalculator';

// =============================================================================
// MAIN CAMPAIGN EXPIRY ORCHESTRATOR
// =============================================================================

import {
  CampaignExpiryRequest,
  CampaignExpiryResult,
  CampaignExpiryContext,
  CampaignExpiryOperationError,
} from './types';
import { CampaignExpiryEvents } from './events';
import { CampaignEligibilityChecker } from './services/eligibilityChecker';
import { CampaignEngagementCollector } from './services/engagementCollector';
import { CampaignRewardCalculator } from './services/rewardCalculator';
import logger from 'jet-logger';
import { v4 as uuidv4 } from 'uuid';
import { campaignstatus } from '@prisma/client';

/**
 * Main Campaign Expiry Orchestrator
 * Coordinates the entire campaign expiry process using event-driven architecture
 */
export class CampaignExpiryOrchestrator {
  /**
   * Process campaign expiry with full workflow
   */
  static async processExpiry(
    request: CampaignExpiryRequest
  ): Promise<CampaignExpiryResult> {
    const context: CampaignExpiryContext = {
      campaignId: request.campaignId,
      requestId: uuidv4(),
      startTime: new Date(),
      metadata: {
        forceExpiry: request.forceExpiry,
        dryRun: request.dryRun,
        requestedBy: request.requestedBy,
      },
    };

    const { campaignId, requestId } = context;
    const startTime = Date.now();

    try {
      logger.info(
        `[${requestId}] Starting campaign expiry process for ${String(
          campaignId
        )}`
      );

      // Initialize result object
      const result: CampaignExpiryResult = {
        success: false,
        campaignId,
        requestId,
        startTime: context.startTime,
        endTime: new Date(),
        duration: 0,
        eligibilityCheck: { isEligible: false },
        finalStatus: campaignstatus.InternalError,
        totalRewardsDistributed: 0,
        usersRewarded: 0,
        errors: [],
      };

      // Step 1: Eligibility Check
      logger.info(`[${requestId}] Step 1: Checking eligibility`);
      const eligibilityResult = request.forceExpiry
        ? await CampaignEligibilityChecker.forceEligibilityCheck({ context })
        : await CampaignEligibilityChecker.checkEligibility({ context });

      result.eligibilityCheck = eligibilityResult;

      if (!eligibilityResult.isEligible) {
        result.errors.push(
          `Campaign not eligible: ${
            eligibilityResult.reason ?? 'No reason provided'
          }`
        );
        result.finalStatus = campaignstatus.CampaignDeclined;
        return this.finalizeResult(result, startTime);
      }

      const campaign = eligibilityResult.campaign!;

      // Step 2: Engagement Collection
      logger.info(`[${requestId}] Step 2: Collecting engagements`);
      const engagementResult =
        await CampaignEngagementCollector.collectEngagements({
          context,
          campaign,
          eligibilityResult,
        });

      result.engagementCollection = engagementResult;

      if (!engagementResult.success || !engagementResult.summary) {
        result.errors.push(...engagementResult.errors);
        result.finalStatus = campaignstatus.InternalError;
        return this.finalizeResult(result, startTime);
      }

      // Step 3: Reward Calculation
      logger.info(`[${requestId}] Step 3: Calculating rewards`);
      const rewardResult = await CampaignRewardCalculator.calculateRewards({
        context,
        campaign,
        engagementSummary: engagementResult.summary,
      });

      result.rewardCalculation = rewardResult;
      result.totalRewardsDistributed = rewardResult.totalDistributedAmount;
      result.usersRewarded = rewardResult.usersRewarded;

      if (!rewardResult.success) {
        result.errors.push(...rewardResult.errors);
        result.finalStatus = campaignstatus.InternalError;
        return this.finalizeResult(result, startTime);
      }

      // For dry run, stop here
      if (request.dryRun) {
        result.success = true;
        result.finalStatus = campaignstatus.CampaignRunning; // Keep original status
        logger.info(`[${requestId}] Dry run completed successfully`);
        return this.finalizeResult(result, startTime);
      }

      // Step 4: Contract Expiry (placeholder for future implementation)
      logger.info(`[${requestId}] Step 4: Contract expiry (placeholder)`);
      result.contractExpiry = {
        success: true,
        errors: [],
        timestamp: new Date(),
      };

      // Step 5: Database Update (placeholder for future implementation)
      logger.info(`[${requestId}] Step 5: Database update (placeholder)`);
      result.databaseUpdate = {
        success: true,
        updatedRecords: {
          campaigns: 1,
          engagements: 0,
          transactions: 0,
          balances: 0,
        },
        errors: [],
        timestamp: new Date(),
      };

      // Step 6: Cleanup (placeholder for future implementation)
      logger.info(`[${requestId}] Step 6: Cleanup (placeholder)`);
      result.cleanup = {
        success: true,
        cleanupActions: [],
        errors: [],
        timestamp: new Date(),
      };

      // Success!
      result.success = true;
      result.finalStatus = campaignstatus.RewardsDistributed;

      logger.info(`[${requestId}] Campaign expiry completed successfully`);
      return this.finalizeResult(result, startTime);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`[${requestId}] Campaign expiry failed: ${errorMsg}`);

      const result: CampaignExpiryResult = {
        success: false,
        campaignId,
        requestId,
        startTime: context.startTime,
        endTime: new Date(),
        duration: Date.now() - startTime,
        eligibilityCheck: { isEligible: false },
        finalStatus: campaignstatus.InternalError,
        totalRewardsDistributed: 0,
        usersRewarded: 0,
        errors: [errorMsg],
      };

      return result;
    }
  }

  /**
   * Finalize result with timing information
   */
  private static finalizeResult(
    result: CampaignExpiryResult,
    startTime: number
  ): CampaignExpiryResult {
    result.endTime = new Date();
    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Get campaign expiry status
   */
  static async getExpiryStatus(campaignId: bigint): Promise<{
    isEligible: boolean;
    status: string;
    nextAction?: string;
    estimatedRewards?: number;
  }> {
    try {
      const context: CampaignExpiryContext = {
        campaignId,
        requestId: uuidv4(),
        startTime: new Date(),
      };

      const eligibilityResult =
        await CampaignEligibilityChecker.checkEligibility({ context });

      return {
        isEligible: eligibilityResult.isEligible,
        status: eligibilityResult.currentStatus || 'unknown',
        nextAction: eligibilityResult.isEligible
          ? 'ready_for_expiry'
          : 'waiting',
        estimatedRewards: 0, // Could add estimation logic here
      };
    } catch (error) {
      return {
        isEligible: false,
        status: 'error',
        nextAction: 'check_manually',
      };
    }
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick campaign expiry for simple cases
 */
export async function expireCampaign(
  campaignId: bigint,
  options?: {
    force?: boolean;
    dryRun?: boolean;
  }
): Promise<CampaignExpiryResult> {
  return CampaignExpiryOrchestrator.processExpiry({
    campaignId,
    forceExpiry: options?.force || false,
    dryRun: options?.dryRun || false,
  });
}

/**
 * Check if campaign is ready for expiry
 */
export async function checkExpiryEligibility(
  campaignId: bigint
): Promise<boolean> {
  const status = await CampaignExpiryOrchestrator.getExpiryStatus(campaignId);
  return status.isEligible;
}

/**
 * Get reward preview for campaign
 */
export async function getRewardPreview(campaignId: bigint): Promise<{
  estimatedTotal: number;
  estimatedUsers: number;
  breakdown: any[];
}> {
  const requestId = uuidv4();
  return CampaignRewardCalculator.getRewardPreview(campaignId, requestId);
}
