/**
 * V201 Campaign Timing Optimization Analysis
 *
 * Analysis of optimal time gap between campaign close and campaign expire,
 * considering X API rate limits, late engagement processing, and system reliability.
 */

interface TimingConstraints {
  // X API Rate Limits (per 15-minute window)
  xApiRateLimits: {
    tweetLikedBy: number;      // 75 requests per 15 min
    tweetRetweetedBy: number;  // 75 requests per 15 min
    searchTweets: number;      // 300 requests per 15 min
    userTweets: number;        // 900 requests per 15 min
  };

  // Current System Configuration
  currentConfig: {
    engagementCollectionInterval: number; // 30 minutes
    maxCollectionAttempts: number;        // 5 attempts
    suspiciousEngagementBuffer: number;   // 30 minutes after close
    maxWaitTimeAfterClose: number;        // 2 hours
    minCollectionAttempts: number;        // 3 attempts
  };

  // Business Requirements
  businessNeeds: {
    engagementAccuracyTarget: number;     // 95% accuracy target
    lateEngagementGracePeriod: number;    // Time to allow late engagements
    userExperienceMaxWait: number;        // Max time users wait for rewards
    systemReliabilityRequirement: number; // 99.9% system availability
  };
}

const TIMING_ANALYSIS: TimingConstraints = {
  xApiRateLimits: {
    tweetLikedBy: 75,      // 75 requests per 15 min = 5 req/min = 1 req/12sec
    tweetRetweetedBy: 75,  // 75 requests per 15 min = 5 req/min = 1 req/12sec
    searchTweets: 300,     // 300 requests per 15 min = 20 req/min = 1 req/3sec
    userTweets: 900,       // 900 requests per 15 min = 60 req/min = 1 req/sec
  },

  currentConfig: {
    engagementCollectionInterval: 30 * 60 * 1000, // 30 minutes
    maxCollectionAttempts: 5,
    suspiciousEngagementBuffer: 30 * 60 * 1000,   // 30 minutes
    maxWaitTimeAfterClose: 2 * 60 * 60 * 1000,    // 2 hours
    minCollectionAttempts: 3,
  },

  businessNeeds: {
    engagementAccuracyTarget: 0.95,        // 95%
    lateEngagementGracePeriod: 15 * 60 * 1000,  // 15 minutes
    userExperienceMaxWait: 4 * 60 * 60 * 1000,  // 4 hours
    systemReliabilityRequirement: 0.999,   // 99.9%
  }
};

/**
 * Analysis of optimal timing scenarios
 */
interface TimingScenario {
  name: string;
  description: string;
  closeToExpireGap: number; // milliseconds
  phases: {
    phase: string;
    duration: number;
    activity: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  }[];
  pros: string[];
  cons: string[];
  recommendation: 'RECOMMENDED' | 'ACCEPTABLE' | 'NOT_RECOMMENDED';
  rateLimit: {
    apiCallsNeeded: number;
    timeRequired: number;
    rateUtilization: number; // percentage of rate limit used
  };
}

/**
 * Scenario Analysis: Different timing approaches
 */
const TIMING_SCENARIOS: TimingScenario[] = [
  {
    name: "Conservative (3 Hours)",
    description: "Long buffer for comprehensive data collection and rate limit safety",
    closeToExpireGap: 3 * 60 * 60 * 1000, // 3 hours
    phases: [
      {
        phase: "Grace Period",
        duration: 30 * 60 * 1000, // 30 minutes
        activity: "Allow late legitimate engagements",
        riskLevel: 'LOW'
      },
      {
        phase: "Data Collection",
        duration: 2 * 60 * 60 * 1000, // 2 hours
        activity: "Multiple API calls with 30-min intervals",
        riskLevel: 'LOW'
      },
      {
        phase: "Processing & Validation",
        duration: 20 * 60 * 1000, // 20 minutes
        activity: "Timestamp validation, reward calculation",
        riskLevel: 'LOW'
      },
      {
        phase: "Buffer",
        duration: 10 * 60 * 1000, // 10 minutes
        activity: "Safety margin for unexpected delays",
        riskLevel: 'LOW'
      }
    ],
    pros: [
      "Maximum accuracy for engagement data",
      "No risk of hitting X API rate limits",
      "Multiple retry opportunities",
      "Comprehensive late engagement capture",
      "High system reliability"
    ],
    cons: [
      "Longer wait time for users",
      "Higher infrastructure costs",
      "May be unnecessarily conservative"
    ],
    recommendation: 'RECOMMENDED',
    rateLimit: {
      apiCallsNeeded: 16, // 4 collections × 4 API calls per collection
      timeRequired: 2 * 60 * 60 * 1000, // 2 hours
      rateUtilization: 21.3 // 16/75 = 21.3% of rate limit per endpoint
    }
  },

  {
    name: "Balanced (2 Hours)",
    description: "Current system configuration - balance between speed and accuracy",
    closeToExpireGap: 2 * 60 * 60 * 1000, // 2 hours
    phases: [
      {
        phase: "Grace Period",
        duration: 15 * 60 * 1000, // 15 minutes
        activity: "Allow essential late engagements",
        riskLevel: 'LOW'
      },
      {
        phase: "Data Collection",
        duration: 90 * 60 * 1000, // 1.5 hours
        activity: "API calls every 30 minutes",
        riskLevel: 'MEDIUM'
      },
      {
        phase: "Processing",
        duration: 10 * 60 * 1000, // 10 minutes
        activity: "Final validation and reward distribution",
        riskLevel: 'MEDIUM'
      },
      {
        phase: "Safety Buffer",
        duration: 5 * 60 * 1000, // 5 minutes
        activity: "Contingency for delays",
        riskLevel: 'LOW'
      }
    ],
    pros: [
      "Good balance of speed and accuracy",
      "Reasonable user wait time",
      "Safe rate limit utilization",
      "Current proven system"
    ],
    cons: [
      "May miss some very late engagements",
      "Less retry opportunities",
      "Moderate time pressure on processing"
    ],
    recommendation: 'ACCEPTABLE',
    rateLimit: {
      apiCallsNeeded: 12, // 3 collections × 4 API calls
      timeRequired: 90 * 60 * 1000, // 1.5 hours
      rateUtilization: 16.0 // 12/75 = 16% of rate limit
    }
  },

  {
    name: "Aggressive (1 Hour)",
    description: "Fast turnaround with higher risk of missed engagements",
    closeToExpireGap: 1 * 60 * 60 * 1000, // 1 hour
    phases: [
      {
        phase: "Minimal Grace",
        duration: 10 * 60 * 1000, // 10 minutes
        activity: "Brief late engagement window",
        riskLevel: 'MEDIUM'
      },
      {
        phase: "Rapid Collection",
        duration: 40 * 60 * 1000, // 40 minutes
        activity: "Faster API collection cycles",
        riskLevel: 'HIGH'
      },
      {
        phase: "Fast Processing",
        duration: 8 * 60 * 1000, // 8 minutes
        activity: "Rapid validation and rewards",
        riskLevel: 'HIGH'
      },
      {
        phase: "Minimal Buffer",
        duration: 2 * 60 * 1000, // 2 minutes
        activity: "Emergency buffer only",
        riskLevel: 'HIGH'
      }
    ],
    pros: [
      "Fast user experience",
      "Quick campaign turnover",
      "Lower infrastructure costs"
    ],
    cons: [
      "Higher risk of missing legitimate engagements",
      "Potential rate limit pressure",
      "Less error recovery time",
      "May compromise accuracy"
    ],
    recommendation: 'NOT_RECOMMENDED',
    rateLimit: {
      apiCallsNeeded: 8, // 2 collections × 4 API calls
      timeRequired: 40 * 60 * 1000, // 40 minutes
      rateUtilization: 10.7 // 8/75 = 10.7% - seems safe but less thorough
    }
  }
];

/**
 * Rate Limit Analysis for Different Campaign Volumes
 */
interface RateLimitAnalysis {
  concurrent_campaigns: number;
  api_calls_per_campaign: number;
  total_calls_per_15min: number;
  rate_limit_utilization: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  max_safe_campaigns: number;
}

const RATE_LIMIT_SCENARIOS: RateLimitAnalysis[] = [
  {
    concurrent_campaigns: 1,
    api_calls_per_campaign: 4, // likes + retweets + quotes + replies
    total_calls_per_15min: 4,
    rate_limit_utilization: 5.3, // 4/75 = 5.3%
    risk_level: 'LOW',
    max_safe_campaigns: 18 // 75/4 = 18.75
  },
  {
    concurrent_campaigns: 5,
    api_calls_per_campaign: 4,
    total_calls_per_15min: 20,
    rate_limit_utilization: 26.7, // 20/75 = 26.7%
    risk_level: 'LOW',
    max_safe_campaigns: 18
  },
  {
    concurrent_campaigns: 10,
    api_calls_per_campaign: 4,
    total_calls_per_15min: 40,
    rate_limit_utilization: 53.3, // 40/75 = 53.3%
    risk_level: 'MEDIUM',
    max_safe_campaigns: 18
  },
  {
    concurrent_campaigns: 15,
    api_calls_per_campaign: 4,
    total_calls_per_15min: 60,
    rate_limit_utilization: 80.0, // 60/75 = 80%
    risk_level: 'HIGH',
    max_safe_campaigns: 18
  },
  {
    concurrent_campaigns: 20,
    api_calls_per_campaign: 4,
    total_calls_per_15min: 80,
    rate_limit_utilization: 106.7, // 80/75 = 106.7% - OVER LIMIT!
    risk_level: 'CRITICAL',
    max_safe_campaigns: 18
  }
];

/**
 * FINAL RECOMMENDATIONS
 */
const OPTIMAL_TIMING_RECOMMENDATION = {
  recommended_gap: "2.5 Hours (150 minutes)",
  reasoning: [
    "Balances user experience with data accuracy",
    "Provides adequate buffer for X API rate limits",
    "Allows for comprehensive engagement data collection",
    "Includes safety margin for system delays",
    "Supports up to 15 concurrent campaigns safely"
  ],

  phase_breakdown: {
    "Grace Period (30 min)": "Allow legitimate late engagements after campaign close",
    "Primary Data Collection (90 min)": "3 collection cycles at 30-minute intervals",
    "Processing & Validation (20 min)": "Timestamp validation, reward calculation, suspicious engagement filtering",
    "Safety Buffer (10 min)": "Contingency for system delays or retry operations"
  },

  rate_limit_safety: {
    "API calls per campaign": 12, // 3 collections × 4 endpoints
    "Rate limit utilization": "16% per endpoint",
    "Safe concurrent campaigns": 15,
    "Emergency scaling capacity": "Up to 18 campaigns before rate limit risk"
  },

  key_metrics: {
    "Expected engagement accuracy": "95%+",
    "Late engagement capture": "90%+ of legitimate late engagements",
    "System reliability": "99.9%+",
    "User wait time": "2.5 hours (acceptable for reward accuracy)"
  },

  adaptive_logic: {
    "High engagement campaigns (>50 engagements)": "May complete in 2 hours if data is stable",
    "Low engagement campaigns (<10 engagements)": "May complete in 1.5 hours to improve UX",
    "Rate limit pressure": "Automatically extend intervals to 45-60 minutes if needed",
    "System failures": "Automatic retry with exponential backoff up to 4 hours max"
  }
};

/**
 * CRITICAL TIMING ANALYSIS: First X API Call After Campaign Close
 */
const FIRST_API_CALL_ANALYSIS = {
  current_implementation: {
    buffer_after_close: 5 * 60 * 1000, // 5 minutes
    description: "Campaign closes → Wait 5 minutes → First X API call",
    reasoning: "5-minute buffer allows late legitimate engagements to complete",
  },

  api_call_sequence: {
    "T+0 (Campaign Close)": {
      action: "Campaign status updated to closed",
      x_api_calls: 0,
      system_activity: "Database update, status change, queue scheduling"
    },
    "T+5min (First Data Collection)": {
      action: "First engagement data collection starts",
      x_api_calls: 4,
      api_endpoints_called: [
        "tweetLikedBy(tweetId) - Get users who liked",
        "tweetRetweetedBy(tweetId) - Get users who retweeted",
        "getAllUsersWhoQuotedOnTweetId(tweetId) - Get quote tweets",
        "getAllReplies(tweetId) - Get reply tweets"
      ],
      duration: "30-60 seconds per API call",
      total_collection_time: "2-4 minutes for all endpoints"
    },
    "T+35min (Second Collection)": {
      action: "Second engagement data collection cycle",
      x_api_calls: 4,
      reasoning: "30-minute interval from first collection (T+5min + 30min)"
    },
    "T+65min (Third Collection)": {
      action: "Third engagement data collection cycle",
      x_api_calls: 4,
      reasoning: "30-minute interval from second collection"
    }
  },

  timing_breakdown: {
    "Immediate (0-1 minute)": "Campaign close processing, database updates",
    "Grace Period (1-5 minutes)": "Buffer for late legitimate engagements",
    "First API Calls (5-9 minutes)": "Initial comprehensive engagement data collection",
    "Processing (9-10 minutes)": "Data validation, timestamp checking",
    "Next Collection Scheduled": "T+35min for second data collection cycle"
  },

  rate_limit_impact_first_call: {
    api_calls_made: 4,
    rate_limit_consumption: {
      tweetLikedBy: "1/75 requests (1.3% of 15-min window)",
      tweetRetweetedBy: "1/75 requests (1.3% of 15-min window)",
      searchTweets: "1/300 requests (0.33% of 15-min window)", // for quotes
      userTweets: "1/900 requests (0.11% of 15-min window)" // for replies
    },
    total_utilization: "4 API calls in ~3 minutes",
    safety_margin: "Extremely safe - uses <2% of any rate limit"
  },

  concurrent_campaign_impact: {
    single_campaign: {
      first_call_timing: "T+5min",
      api_pressure: "Negligible"
    },
    five_campaigns_closing_together: {
      first_calls: "All at T+5min",
      total_api_calls: 20, // 5 campaigns × 4 calls each
      rate_limit_pressure: "Still safe - only 26.7% utilization",
      staggering_recommendation: "Not needed for 5 campaigns"
    },
    fifteen_campaigns_closing_together: {
      first_calls: "All at T+5min if no staggering",
      total_api_calls: 60, // 15 campaigns × 4 calls each
      rate_limit_pressure: "80% utilization - approaching limits",
      staggering_recommendation: "RECOMMENDED - spread first calls over 10-15 minutes"
    },
    twenty_plus_campaigns: {
      risk_level: "CRITICAL - Will exceed rate limits",
      required_staggering: "MANDATORY - 2-3 minute intervals between campaign data collection starts"
    }
  }
};

/**
 * OPTIMIZATION RECOMMENDATIONS FOR FIRST API CALL TIMING
 */
const FIRST_API_CALL_OPTIMIZATIONS = {
  current_timing_assessment: {
    status: "GOOD BUT CAN BE IMPROVED",
    current_delay: "5 minutes",
    pros: [
      "Allows legitimate late engagements",
      "Simple implementation",
      "Predictable timing"
    ],
    cons: [
      "May be too short for high-engagement campaigns",
      "Doesn't account for X API response delays",
      "No staggering for concurrent campaigns"
    ]
  },

  recommended_improvements: {
    adaptive_first_call_delay: {
      high_engagement_campaigns: "10 minutes (>100 engagements at close)",
      medium_engagement_campaigns: "7 minutes (10-100 engagements)",
      low_engagement_campaigns: "5 minutes (<10 engagements)",
      reasoning: "Higher engagement = more potential late interactions"
    },

    concurrent_campaign_staggering: {
      implementation: "Add random 0-5 minute jitter to avoid API call bursts",
      formula: "baseDelay + (campaignId % 5) minutes",
      example: "Campaign A: T+5min, Campaign B: T+6min, Campaign C: T+7min..."
    },

    intelligent_scheduling: {
      check_recent_engagement_velocity: "Delay longer if engagement rate is high near close",
      x_api_health_monitoring: "Extend delay if X API is showing high latency",
      business_hours_adjustment: "Slightly longer delays during peak hours"
    }
  },

  proposed_new_timing: {
    base_delay: "7 minutes", // Up from 5 minutes
    adaptive_range: "5-12 minutes based on campaign characteristics",
    staggering_jitter: "0-3 minutes random offset for concurrent campaigns",
    total_first_call_window: "7-15 minutes after campaign close"
  }
};

export {
  FIRST_API_CALL_ANALYSIS,
  FIRST_API_CALL_OPTIMIZATIONS,
  TIMING_ANALYSIS,
  TIMING_SCENARIOS,
  RATE_LIMIT_SCENARIOS,
  OPTIMAL_TIMING_RECOMMENDATION,
};
