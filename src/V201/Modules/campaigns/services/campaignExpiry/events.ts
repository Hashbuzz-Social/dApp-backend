import {
  CampaignExpiryContext,
  EligibilityCheckPayload,
  EngagementCollectionPayload,
  RewardCalculationPayload,
  ContractExpiryPayload,
  DatabaseUpdatePayload,
  CleanupPayload,
  CampaignExpiryResult
} from './types';

// =============================================================================
// CAMPAIGN EXPIRY EVENT TYPES
// =============================================================================

export enum CampaignExpiryEvents {
  // Main orchestration events
  CAMPAIGN_EXPIRY_INITIATED = 'CAMPAIGN_EXPIRY_INITIATED',
  CAMPAIGN_EXPIRY_COMPLETED = 'CAMPAIGN_EXPIRY_COMPLETED',
  CAMPAIGN_EXPIRY_FAILED = 'CAMPAIGN_EXPIRY_FAILED',

  // Step-specific events
  ELIGIBILITY_CHECK_REQUESTED = 'ELIGIBILITY_CHECK_REQUESTED',
  ELIGIBILITY_CHECK_COMPLETED = 'ELIGIBILITY_CHECK_COMPLETED',
  ELIGIBILITY_CHECK_FAILED = 'ELIGIBILITY_CHECK_FAILED',

  ENGAGEMENT_COLLECTION_REQUESTED = 'ENGAGEMENT_COLLECTION_REQUESTED',
  ENGAGEMENT_COLLECTION_COMPLETED = 'ENGAGEMENT_COLLECTION_COMPLETED',
  ENGAGEMENT_COLLECTION_FAILED = 'ENGAGEMENT_COLLECTION_FAILED',

  REWARD_CALCULATION_REQUESTED = 'REWARD_CALCULATION_REQUESTED',
  REWARD_CALCULATION_COMPLETED = 'REWARD_CALCULATION_COMPLETED',
  REWARD_CALCULATION_FAILED = 'REWARD_CALCULATION_FAILED',

  CONTRACT_EXPIRY_REQUESTED = 'CONTRACT_EXPIRY_REQUESTED',
  CONTRACT_EXPIRY_COMPLETED = 'CONTRACT_EXPIRY_COMPLETED',
  CONTRACT_EXPIRY_FAILED = 'CONTRACT_EXPIRY_FAILED',

  DATABASE_UPDATE_REQUESTED = 'DATABASE_UPDATE_REQUESTED',
  DATABASE_UPDATE_COMPLETED = 'DATABASE_UPDATE_COMPLETED',
  DATABASE_UPDATE_FAILED = 'DATABASE_UPDATE_FAILED',

  CLEANUP_REQUESTED = 'CLEANUP_REQUESTED',
  CLEANUP_COMPLETED = 'CLEANUP_COMPLETED',
  CLEANUP_FAILED = 'CLEANUP_FAILED'
}

// =============================================================================
// EVENT PAYLOAD MAP
// =============================================================================

export interface CampaignExpiryEventPayloads {
  // Orchestration events
  [CampaignExpiryEvents.CAMPAIGN_EXPIRY_INITIATED]: {
    context: CampaignExpiryContext;
  };
  
  [CampaignExpiryEvents.CAMPAIGN_EXPIRY_COMPLETED]: {
    context: CampaignExpiryContext;
    result: CampaignExpiryResult;
  };
  
  [CampaignExpiryEvents.CAMPAIGN_EXPIRY_FAILED]: {
    context: CampaignExpiryContext;
    error: Error;
    step: string;
  };

  // Eligibility check events
  [CampaignExpiryEvents.ELIGIBILITY_CHECK_REQUESTED]: EligibilityCheckPayload;
  
  [CampaignExpiryEvents.ELIGIBILITY_CHECK_COMPLETED]: {
    context: CampaignExpiryContext;
    result: import('./types').EligibilityCheckResult;
  };
  
  [CampaignExpiryEvents.ELIGIBILITY_CHECK_FAILED]: {
    context: CampaignExpiryContext;
    error: Error;
  };

  // Engagement collection events
  [CampaignExpiryEvents.ENGAGEMENT_COLLECTION_REQUESTED]: EngagementCollectionPayload;
  
  [CampaignExpiryEvents.ENGAGEMENT_COLLECTION_COMPLETED]: {
    context: CampaignExpiryContext;
    result: import('./types').EngagementCollectionResult;
  };
  
  [CampaignExpiryEvents.ENGAGEMENT_COLLECTION_FAILED]: {
    context: CampaignExpiryContext;
    error: Error;
  };

  // Reward calculation events
  [CampaignExpiryEvents.REWARD_CALCULATION_REQUESTED]: RewardCalculationPayload;
  
  [CampaignExpiryEvents.REWARD_CALCULATION_COMPLETED]: {
    context: CampaignExpiryContext;
    result: import('./types').RewardCalculationResult;
  };
  
  [CampaignExpiryEvents.REWARD_CALCULATION_FAILED]: {
    context: CampaignExpiryContext;
    error: Error;
  };

  // Contract expiry events
  [CampaignExpiryEvents.CONTRACT_EXPIRY_REQUESTED]: ContractExpiryPayload;
  
  [CampaignExpiryEvents.CONTRACT_EXPIRY_COMPLETED]: {
    context: CampaignExpiryContext;
    result: import('./types').ContractExpiryResult;
  };
  
  [CampaignExpiryEvents.CONTRACT_EXPIRY_FAILED]: {
    context: CampaignExpiryContext;
    error: Error;
  };

  // Database update events
  [CampaignExpiryEvents.DATABASE_UPDATE_REQUESTED]: DatabaseUpdatePayload;
  
  [CampaignExpiryEvents.DATABASE_UPDATE_COMPLETED]: {
    context: CampaignExpiryContext;
    result: import('./types').DatabaseUpdateResult;
  };
  
  [CampaignExpiryEvents.DATABASE_UPDATE_FAILED]: {
    context: CampaignExpiryContext;
    error: Error;
  };

  // Cleanup events
  [CampaignExpiryEvents.CLEANUP_REQUESTED]: CleanupPayload;
  
  [CampaignExpiryEvents.CLEANUP_COMPLETED]: {
    context: CampaignExpiryContext;
    result: import('./types').CleanupResult;
  };
  
  [CampaignExpiryEvents.CLEANUP_FAILED]: {
    context: CampaignExpiryContext;
    error: Error;
  };
}

// =============================================================================
// EVENT HELPER TYPES
// =============================================================================

export type CampaignExpiryEventType = keyof CampaignExpiryEventPayloads;

export interface BaseEventPayload {
  context: CampaignExpiryContext;
}

export interface SuccessEventPayload<T = any> extends BaseEventPayload {
  result: T;
}

export interface FailureEventPayload extends BaseEventPayload {
  error: Error;
  step?: string;
}

// =============================================================================
// EVENT VALIDATION HELPERS
// =============================================================================

export const isExpiryEvent = (eventType: string): eventType is CampaignExpiryEventType => {
  return Object.values(CampaignExpiryEvents).includes(eventType as CampaignExpiryEvents);
};

export const isSuccessEvent = (eventType: CampaignExpiryEventType): boolean => {
  return eventType.includes('_COMPLETED');
};

export const isFailureEvent = (eventType: CampaignExpiryEventType): boolean => {
  return eventType.includes('_FAILED');
};

export const getEventStep = (eventType: CampaignExpiryEventType): string => {
  if (eventType.includes('ELIGIBILITY')) return 'eligibility-check';
  if (eventType.includes('ENGAGEMENT')) return 'engagement-collection';
  if (eventType.includes('REWARD')) return 'reward-calculation';
  if (eventType.includes('CONTRACT')) return 'contract-expiry';
  if (eventType.includes('DATABASE')) return 'database-update';
  if (eventType.includes('CLEANUP')) return 'cleanup';
  return 'orchestration';
};