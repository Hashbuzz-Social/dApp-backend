import { campaign_twittercard, campaignstatus, payment_status } from '@prisma/client';

// =============================================================================
// CORE CONTEXT AND REQUEST TYPES
// =============================================================================

export interface CampaignExpiryContext {
  campaignId: bigint;
  requestId: string;
  startTime: Date;
  metadata?: Record<string, any>;
}

export interface CampaignExpiryRequest {
  campaignId: bigint;
  forceExpiry?: boolean;
  dryRun?: boolean;
  requestedBy?: string;
}

// =============================================================================
// ELIGIBILITY CHECKING TYPES
// =============================================================================

export interface EligibilityCheckResult {
  isEligible: boolean;
  reason?: string;
  campaign?: campaign_twittercard;
  currentStatus?: campaignstatus;
  expiryTime?: Date;
  blockers?: string[];
}

export interface EligibilityCheckPayload {
  context: CampaignExpiryContext;
  campaign?: campaign_twittercard;
}

// =============================================================================
// ENGAGEMENT DATA COLLECTION TYPES
// =============================================================================

export interface EngagementSummary {
  totalEngagements: number;
  validEngagements: number;
  totalRewardAmount: number;
  eligibleUsers: number;
  engagementBreakdown: {
    likes: number;
    retweets: number;
    quotes: number;
    replies: number;
  };
  dataCollectionTimestamp: Date;
}

export interface EngagementCollectionPayload {
  context: CampaignExpiryContext;
  campaign: campaign_twittercard;
  eligibilityResult: EligibilityCheckResult;
}

export interface EngagementCollectionResult {
  success: boolean;
  summary?: EngagementSummary;
  errors: string[];
  timestamp: Date;
}

// =============================================================================
// REWARD CALCULATION TYPES
// =============================================================================

export interface RewardCalculationResult {
  totalDistributedAmount: number;
  remainingBalance: number;
  usersRewarded: number;
  rewardBreakdown: Array<{
    userId: bigint;
    amount: number;
    engagementType: string;
    transactionId?: string;
  }>;
  success: boolean;
  errors: string[];
  calculationTimestamp: Date;
}

export interface RewardCalculationPayload {
  context: CampaignExpiryContext;
  campaign: campaign_twittercard;
  engagementSummary: EngagementSummary;
}

// =============================================================================
// CONTRACT OPERATIONS TYPES
// =============================================================================

export interface ContractExpiryResult {
  success: boolean;
  transactionId?: string;
  contractCallResult?: any;
  finalContractState?: {
    isExpired: boolean;
    remainingBalance: number;
    totalDistributed: number;
  };
  errors: string[];
  timestamp: Date;
}

export interface ContractExpiryPayload {
  context: CampaignExpiryContext;
  campaign: campaign_twittercard;
  rewardCalculation: RewardCalculationResult;
}

// =============================================================================
// DATABASE UPDATE TYPES
// =============================================================================

export interface DatabaseUpdateResult {
  success: boolean;
  updatedCampaign?: campaign_twittercard;
  updatedRecords: {
    campaigns: number;
    engagements: number;
    transactions: number;
    balances: number;
  };
  errors: string[];
  timestamp: Date;
}

export interface DatabaseUpdatePayload {
  context: CampaignExpiryContext;
  campaign: campaign_twittercard;
  contractResult: ContractExpiryResult;
  rewardCalculation: RewardCalculationResult;
  finalStatus: campaignstatus;
}

// =============================================================================
// CLEANUP TYPES
// =============================================================================

export interface CleanupResult {
  success: boolean;
  cleanupActions: Array<{
    action: string;
    success: boolean;
    details?: string;
  }>;
  errors: string[];
  timestamp: Date;
}

export interface CleanupPayload {
  context: CampaignExpiryContext;
  campaign: campaign_twittercard;
  databaseResult: DatabaseUpdateResult;
}

// =============================================================================
// FINAL RESULT TYPES
// =============================================================================

export interface CampaignExpiryResult {
  success: boolean;
  campaignId: bigint;
  requestId: string;
  startTime: Date;
  endTime: Date;
  duration: number; // milliseconds
  
  // Step results
  eligibilityCheck: EligibilityCheckResult;
  engagementCollection?: EngagementCollectionResult;
  rewardCalculation?: RewardCalculationResult;
  contractExpiry?: ContractExpiryResult;
  databaseUpdate?: DatabaseUpdateResult;
  cleanup?: CleanupResult;
  
  // Summary
  finalStatus: campaignstatus;
  totalRewardsDistributed: number;
  usersRewarded: number;
  errors: string[];
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export interface CampaignExpiryError extends Error {
  code: string;
  campaignId: bigint;
  requestId: string;
  step: string;
  details?: Record<string, any>;
}

export class CampaignExpiryOperationError extends Error implements CampaignExpiryError {
  code: string;
  campaignId: bigint;
  requestId: string;
  step: string;
  details?: Record<string, any>;

  constructor(
    message: string,
    code: string,
    campaignId: bigint,
    requestId: string,
    step: string,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'CampaignExpiryOperationError';
    this.code = code;
    this.campaignId = campaignId;
    this.requestId = requestId;
    this.step = step;
    this.details = details;
  }
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type ExpiryStep = 
  | 'eligibility-check'
  | 'engagement-collection'
  | 'reward-calculation'
  | 'contract-expiry'
  | 'database-update'
  | 'cleanup';

export interface StepResult<T = any> {
  step: ExpiryStep;
  success: boolean;
  data?: T;
  errors: string[];
  timestamp: Date;
  duration: number; // milliseconds
}