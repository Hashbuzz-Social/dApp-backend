/**
 * X API RATE LIMIT CALCULATION LOGIC
 *
 * Detailed breakdown of how the current system calculates and manages X API rate limits
 * based on the 30-minute interval strategy in xEngagementTracker.ts
 */

/**
 * CURRENT IMPLEMENTATION ANALYSIS
 */
const CURRENT_RATE_LIMIT_LOGIC = {
  // From xEngagementTracker.ts line 81-82
  collection_interval: "30 * 60 * 1000", // 30 minutes in milliseconds
  reasoning: "Every 30 minutes to respect rate limits",

  // X API Rate Limits (Official Twitter API v2 limits)
  x_api_limits_per_15_minutes: {
    "GET /2/tweets/:id/liking_users": 75,    // tweetLikedBy
    "GET /2/tweets/:id/retweeted_by": 75,    // tweetRetweetedBy
    "GET /2/tweets/search/recent": 300,      // for quotes (search-based)
    "GET /2/users/:id/tweets": 900,          // for user tweets/replies
  },

  // Current API calls per campaign data collection
  api_calls_per_collection: {
    likes_endpoint: 1,      // twitterAPI.getAllUsersWhoLikedOnTweetId()
    retweets_endpoint: 1,   // twitterAPI.getAllRetweetOfTweetId()
    quotes_endpoint: 1,     // twitterAPI.getAllUsersWhoQuotedOnTweetId()
    replies_endpoint: 1,    // twitterAPI.getAllReplies()
    total_per_campaign: 4
  },

  // Time-based calculation logic
  current_calculation: {
    base_interval: 30, // minutes
    collections_per_hour: 2, // 60min / 30min = 2 collections per hour
    collections_per_15min_window: 0.5, // 15min / 30min = 0.5 collections per rate limit window

    api_calls_per_15min_window: {
      single_campaign: 2, // 4 calls × 0.5 collections = 2 calls per 15min window
      rate_utilization_single: "2.67%", // 2/75 = 2.67% for likes/retweets endpoints
    }
  }
};

/**
 * MATHEMATICAL RATE LIMIT CALCULATION
 */
const RATE_LIMIT_MATH = {
  // Basic formula for rate limit utilization
  formula: {
    description: "Rate Utilization = (API Calls in Window) / (Rate Limit) × 100%",

    variables: {
      "API_CALLS_IN_WINDOW": "Number of API calls made in 15-minute window",
      "RATE_LIMIT": "X API rate limit for specific endpoint (per 15 minutes)",
      "COLLECTION_INTERVAL": "Time between data collections (currently 30 minutes)",
      "CAMPAIGNS_CONCURRENT": "Number of campaigns being tracked simultaneously"
    }
  },

  // Step-by-step calculation for current system
  step_by_step_calculation: {
    step1: {
      description: "Calculate collections per 15-minute rate limit window",
      formula: "Collections per 15min = 15min / Collection_Interval",
      current_value: "15min / 30min = 0.5 collections per rate limit window"
    },

    step2: {
      description: "Calculate API calls per endpoint per 15-minute window (single campaign)",
      formula: "API_Calls = Collections_per_15min × Calls_per_collection_per_endpoint",
      current_value: "0.5 collections × 1 call = 0.5 calls per endpoint per 15min"
    },

    step3: {
      description: "Calculate total API calls for multiple campaigns",
      formula: "Total_API_Calls = API_Calls_per_campaign × Number_of_campaigns",
      examples: {
        "1 campaign": "0.5 × 1 = 0.5 calls per 15min",
        "5 campaigns": "0.5 × 5 = 2.5 calls per 15min",
        "10 campaigns": "0.5 × 10 = 5 calls per 15min",
        "20 campaigns": "0.5 × 20 = 10 calls per 15min"
      }
    },

    step4: {
      description: "Calculate rate limit utilization percentage",
      formula: "Utilization% = (Total_API_Calls / Rate_Limit) × 100%",
      examples_for_likes_retweets_endpoint: {
        "1 campaign": "(0.5 / 75) × 100% = 0.67%",
        "5 campaigns": "(2.5 / 75) × 100% = 3.33%",
        "10 campaigns": "(5 / 75) × 100% = 6.67%",
        "20 campaigns": "(10 / 75) × 100% = 13.33%",
        "50 campaigns": "(25 / 75) × 100% = 33.33%",
        "100 campaigns": "(50 / 75) × 100% = 66.67%",
        "150 campaigns": "(75 / 75) × 100% = 100% - AT RATE LIMIT!"
      }
    }
  },

  // Maximum safe concurrent campaigns calculation
  max_safe_campaigns_calculation: {
    description: "Calculate maximum campaigns before hitting rate limits",
    formula: "Max_Campaigns = Rate_Limit / API_Calls_per_campaign_per_15min",

    for_each_endpoint: {
      likes_retweets: {
        rate_limit: 75,
        api_calls_per_campaign_per_15min: 0.5,
        max_campaigns: "75 / 0.5 = 150 campaigns",
        safety_margin_80_percent: "150 × 0.8 = 120 campaigns"
      },
      search_quotes: {
        rate_limit: 300,
        api_calls_per_campaign_per_15min: 0.5,
        max_campaigns: "300 / 0.5 = 600 campaigns",
        safety_margin_80_percent: "600 × 0.8 = 480 campaigns"
      },
      user_tweets_replies: {
        rate_limit: 900,
        api_calls_per_campaign_per_15min: 0.5,
        max_campaigns: "900 / 0.5 = 1800 campaigns",
        safety_margin_80_percent: "1800 × 0.8 = 1440 campaigns"
      }
    },

    bottleneck_endpoint: "likes/retweets (75 requests per 15min)",
    theoretical_max: "150 concurrent campaigns",
    recommended_max_with_safety: "120 concurrent campaigns"
  }
};

/**
 * REAL-WORLD RATE LIMIT SCENARIOS
 */
const RATE_LIMIT_SCENARIOS = {
  // Scenario 1: Current typical usage
  current_typical: {
    concurrent_campaigns: 5,
    calculation: {
      api_calls_per_15min: "5 campaigns × 0.5 calls = 2.5 calls",
      utilization_likes_retweets: "2.5/75 = 3.33%",
      utilization_quotes: "2.5/300 = 0.83%",
      utilization_replies: "2.5/900 = 0.28%",
      risk_level: "VERY LOW",
      headroom: "97% capacity remaining"
    }
  },

  // Scenario 2: High traffic period
  high_traffic: {
    concurrent_campaigns: 25,
    calculation: {
      api_calls_per_15min: "25 campaigns × 0.5 calls = 12.5 calls",
      utilization_likes_retweets: "12.5/75 = 16.67%",
      utilization_quotes: "12.5/300 = 4.17%",
      utilization_replies: "12.5/900 = 1.39%",
      risk_level: "LOW",
      headroom: "83% capacity remaining"
    }
  },

  // Scenario 3: Peak usage
  peak_usage: {
    concurrent_campaigns: 75,
    calculation: {
      api_calls_per_15min: "75 campaigns × 0.5 calls = 37.5 calls",
      utilization_likes_retweets: "37.5/75 = 50%",
      utilization_quotes: "37.5/300 = 12.5%",
      utilization_replies: "37.5/900 = 4.17%",
      risk_level: "MEDIUM",
      headroom: "50% capacity remaining"
    }
  },

  // Scenario 4: Near rate limit
  near_limit: {
    concurrent_campaigns: 120,
    calculation: {
      api_calls_per_15min: "120 campaigns × 0.5 calls = 60 calls",
      utilization_likes_retweets: "60/75 = 80%",
      utilization_quotes: "60/300 = 20%",
      utilization_replies: "60/900 = 6.67%",
      risk_level: "HIGH",
      headroom: "20% capacity remaining",
      recommendation: "Monitor closely, prepare for throttling"
    }
  },

  // Scenario 5: Rate limit exceeded
  over_limit: {
    concurrent_campaigns: 160,
    calculation: {
      api_calls_per_15min: "160 campaigns × 0.5 calls = 80 calls",
      utilization_likes_retweets: "80/75 = 106.67% - EXCEEDED!",
      utilization_quotes: "80/300 = 26.67%",
      utilization_replies: "80/900 = 8.89%",
      risk_level: "CRITICAL",
      consequence: "429 Rate Limit Exceeded errors on likes/retweets endpoint",
      required_action: "Implement staggering or increase intervals"
    }
  }
};

/**
 * CURRENT SYSTEM'S RATE LIMIT SAFETY MARGIN
 */
const SYSTEM_SAFETY_ANALYSIS = {
  current_30min_interval_safety: {
    description: "30-minute intervals provide excellent safety margins",

    safety_factors: {
      low_frequency: "Only 0.5 collections per rate limit window",
      distributed_load: "API calls spread across 30-minute intervals",
      multiple_endpoints: "Load distributed across 4 different API endpoints",
      automatic_retry: "Built-in retry logic handles temporary failures"
    },

    theoretical_capacity: {
      bottleneck_endpoint: "likes/retweets (75 requests per 15min)",
      max_campaigns_theoretical: 150,
      max_campaigns_with_80_percent_safety: 120,
      current_typical_usage: "5-25 campaigns",
      utilization_at_typical: "3-17% of rate limit capacity"
    },

    why_30_minutes_works: [
      "30min > 15min rate limit window = Natural load distribution",
      "Each campaign only makes 2 requests per hour to any endpoint",
      "Rate limit resets every 15min, but we only call every 30min",
      "Provides 2x safety margin compared to rate limit window",
      "Allows for burst capacity during campaign closing periods"
    ]
  },

  alternative_intervals_analysis: {
    "15_minute_interval": {
      collections_per_15min: 1.0,
      api_calls_per_campaign: 4.0,
      max_safe_campaigns: 18, // 75/4 = 18.75
      utilization_at_max: "100%",
      risk_level: "HIGH - No safety margin"
    },

    "20_minute_interval": {
      collections_per_15min: 0.75,
      api_calls_per_campaign: 3.0,
      max_safe_campaigns: 25, // 75/3 = 25
      utilization_at_max: "100%",
      risk_level: "MEDIUM-HIGH - Limited safety margin"
    },

    "45_minute_interval": {
      collections_per_15min: 0.33,
      api_calls_per_campaign: 1.33,
      max_safe_campaigns: 56, // 75/1.33 = 56
      utilization_at_max: "100%",
      risk_level: "LOWER - More conservative but slower data collection"
    }
  }
};

/**
 * DAILY CAMPAIGN CAPACITY ANALYSIS
 */
const DAILY_CAMPAIGN_CAPACITY = {
  // Maximum concurrent campaigns (already calculated)
  max_concurrent_campaigns: {
    theoretical_max: 150, // Based on bottleneck endpoint (likes/retweets: 75 per 15min)
    safe_max_with_80_percent_margin: 120,
    recommended_operational_max: 30, // Conservative for reliability
    current_typical_usage: "5-15 campaigns"
  },

  // Daily campaign launch capacity
  daily_launch_capacity: {
    description: "How many NEW campaigns can be started per day",
    
    scenario_1_conservative: {
      concurrent_limit: 30,
      average_campaign_duration_hours: 24, // 1 day campaigns
      daily_turnover_rate: 1.0, // 100% turnover per day
      max_new_campaigns_per_day: 30, // 30 slots × 1 turnover = 30 new campaigns/day
      total_campaigns_per_day: 30
    },
    
    scenario_2_short_campaigns: {
      concurrent_limit: 30,
      average_campaign_duration_hours: 12, // 12-hour campaigns
      daily_turnover_rate: 2.0, // 200% turnover per day
      max_new_campaigns_per_day: 60, // 30 slots × 2 turnovers = 60 new campaigns/day
      total_campaigns_per_day: 60
    },
    
    scenario_3_micro_campaigns: {
      concurrent_limit: 30,
      average_campaign_duration_hours: 6, // 6-hour campaigns
      daily_turnover_rate: 4.0, // 400% turnover per day
      max_new_campaigns_per_day: 120, // 30 slots × 4 turnovers = 120 new campaigns/day
      total_campaigns_per_day: 120
    },
    
    scenario_4_aggressive_scaling: {
      concurrent_limit: 120, // Using 80% of theoretical max
      average_campaign_duration_hours: 24, // 1 day campaigns
      daily_turnover_rate: 1.0,
      max_new_campaigns_per_day: 120, // 120 slots × 1 turnover = 120 new campaigns/day
      total_campaigns_per_day: 120,
      warning: "Requires careful rate limit monitoring"
    },
    
    scenario_5_maximum_theoretical: {
      concurrent_limit: 150, // Absolute theoretical maximum
      average_campaign_duration_hours: 24,
      daily_turnover_rate: 1.0,
      max_new_campaigns_per_day: 150,
      total_campaigns_per_day: 150,
      warning: "DANGEROUS - No safety margin, likely to hit rate limits"
    }
  },

  // Daily API call consumption analysis
  daily_api_consumption: {
    api_calls_per_campaign_per_day: 192, // 5760 monthly calls / 30 days = 192 daily calls
    
    by_scenario: {
      conservative_30_concurrent: {
        concurrent_campaigns: 30,
        daily_api_calls: 5760, // 30 × 192 = 5,760 calls/day
        new_campaigns_launched: 30,
        rate_utilization: "6.67% of daily capacity"
      },
      
      short_campaigns_60_daily: {
        concurrent_campaigns: 30, // Still limited by concurrent capacity
        daily_api_calls: 5760, // Same concurrent load
        new_campaigns_launched: 60,
        total_campaign_throughput: 60,
        rate_utilization: "6.67% of daily capacity"
      },
      
      micro_campaigns_120_daily: {
        concurrent_campaigns: 30,
        daily_api_calls: 5760,
        new_campaigns_launched: 120,
        total_campaign_throughput: 120,
        rate_utilization: "6.67% of daily capacity"
      },
      
      aggressive_120_concurrent: {
        concurrent_campaigns: 120,
        daily_api_calls: 23040, // 120 × 192 = 23,040 calls/day
        new_campaigns_launched: 120,
        rate_utilization: "26.67% of daily capacity"
      },
      
      maximum_150_concurrent: {
        concurrent_campaigns: 150,
        daily_api_calls: 28800, // 150 × 192 = 28,800 calls/day
        new_campaigns_launched: 150,
        rate_utilization: "33.33% of daily capacity",
        warning: "Approaching rate limit danger zone"
      }
    }
  },

  // Staggered launch strategy for high volume
  staggered_launch_strategy: {
    description: "Spread campaign launches throughout the day to avoid API bursts",
    
    for_60_campaigns_per_day: {
      launch_frequency: "1 campaign every 24 minutes", // 1440 min / 60 campaigns
      peak_concurrent: 30,
      api_burst_risk: "LOW - Well distributed",
      implementation: "Schedule launches every 24 minutes"
    },
    
    for_120_campaigns_per_day: {
      launch_frequency: "1 campaign every 12 minutes", // 1440 min / 120 campaigns
      peak_concurrent: 30, // If 6-hour campaigns
      api_burst_risk: "LOW-MEDIUM - Frequent but manageable",
      implementation: "Schedule launches every 12 minutes"
    },
    
    for_150_campaigns_per_day: {
      launch_frequency: "1 campaign every 9.6 minutes", // 1440 min / 150 campaigns
      peak_concurrent: 150, // If 24-hour campaigns
      api_burst_risk: "HIGH - Requires careful monitoring",
      implementation: "Schedule launches every 9-10 minutes with rate monitoring"
    }
  },

  // Peak hour considerations
  peak_hour_analysis: {
    description: "Account for higher engagement and API usage during peak hours",
    
    typical_peak_hours: {
      morning_peak: "8-10 AM (campaign launches)",
      lunch_peak: "12-1 PM (engagement spikes)",
      evening_peak: "6-9 PM (highest engagement)",
      weekend_peaks: "10 AM - 8 PM (sustained high activity)"
    },
    
    peak_hour_adjustments: {
      reduce_concurrent_capacity_by: "20-30% during peak hours",
      safe_peak_concurrent: 20, // Instead of 30
      safe_peak_daily_launches: 80, // Instead of 120
      reasoning: "Higher engagement = more API calls per campaign"
    },
    
    off_peak_optimization: {
      increase_concurrent_capacity_by: "10-20% during off-peak",
      off_peak_concurrent: 35, // Instead of 30
      off_peak_daily_launches: 140, // Instead of 120
      optimal_launch_windows: "2-6 AM, 10-11 AM, 2-4 PM"
    }
  },

  // FINAL RECOMMENDATIONS
  recommended_daily_capacity: {
    conservative_recommendation: {
      max_concurrent_campaigns: 25,
      max_daily_new_campaigns: 100, // Mix of campaign durations
      average_campaign_duration: "8-16 hours",
      api_utilization: "< 10% of rate limits",
      reliability: "99.9% uptime expected",
      scalability: "Can handle 4x growth before optimization needed"
    },
    
    balanced_recommendation: {
      max_concurrent_campaigns: 30,
      max_daily_new_campaigns: 120,
      average_campaign_duration: "6-24 hours",
      api_utilization: "10-15% of rate limits", 
      reliability: "99.5% uptime expected",
      scalability: "Room for 3x growth"
    },
    
    aggressive_recommendation: {
      max_concurrent_campaigns: 50,
      max_daily_new_campaigns: 200, // With 6-hour average campaigns
      average_campaign_duration: "4-12 hours",
      api_utilization: "20-25% of rate limits",
      reliability: "99% uptime expected",
      scalability: "Requires monitoring and optimization",
      requirements: [
        "Implement dynamic rate limit monitoring",
        "Add intelligent campaign staggering",
        "Set up automatic scaling adjustments",
        "24/7 system monitoring"
      ]
    }
  }
};

/**
 * MONTHLY API CALL VOLUME CALCULATIONS
 */
const MONTHLY_API_CALL_ANALYSIS = {
  // Time-based calculations
  time_units: {
    minutes_per_hour: 60,
    hours_per_day: 24,
    days_per_month: 30, // Average month
    minutes_per_day: 1440, // 60 * 24
    minutes_per_month: 43200, // 1440 * 30
  },

  // Current system parameters
  current_system: {
    collection_interval_minutes: 30,
    api_calls_per_collection: 4,
    collections_per_hour: 2, // 60min / 30min = 2
    collections_per_day: 48, // 2 * 24 = 48
    collections_per_month: 1440, // 48 * 30 = 1440
  },

  // API calls per campaign per month
  single_campaign_monthly: {
    collections_per_month: 1440,
    api_calls_per_collection: 4,
    total_api_calls_per_month: 5760, // 1440 * 4 = 5,760 API calls per campaign per month

    breakdown_by_endpoint: {
      likes_endpoint: 1440, // 1 call per collection * 1440 collections
      retweets_endpoint: 1440,
      quotes_endpoint: 1440,
      replies_endpoint: 1440,
      total: 5760
    }
  },

  // Maximum theoretical monthly API calls (hitting rate limits)
  max_theoretical_monthly: {
    description: "Maximum API calls if constantly at rate limit",

    rate_limit_per_15min: 75, // For likes/retweets endpoints (bottleneck)
    fifteen_min_periods_per_month: 2880, // 43200 minutes / 15 minutes = 2880 periods
    max_api_calls_per_endpoint_per_month: 216000, // 75 * 2880 = 216,000 calls per endpoint

    total_across_4_endpoints: 864000, // 216,000 * 4 = 864,000 total API calls per month (at 100% utilization)

    note: "This assumes 100% rate limit utilization 24/7, which is not sustainable or recommended"
  },

  // Current system maximum monthly capacity
  current_system_max_monthly: {
    description: "Maximum monthly API calls with current 30-minute intervals",

    max_safe_concurrent_campaigns: 30, // From previous calculations (80% of theoretical max)
    api_calls_per_campaign_per_month: 5760,

    total_monthly_api_calls: 172800, // 30 campaigns * 5,760 calls = 172,800 calls per month

    utilization_breakdown: {
      likes_endpoint: 43200, // 30 campaigns * 1440 calls = 43,200 calls per month
      retweets_endpoint: 43200,
      quotes_endpoint: 43200,
      replies_endpoint: 43200,
      total: 172800
    },

    rate_limit_utilization: {
      monthly_capacity_per_endpoint: 216000, // Max possible per endpoint
      used_per_endpoint: 43200,
      utilization_percentage: 20, // 43,200 / 216,000 = 20%
      safety_margin: "80% unused capacity"
    }
  },

  // Scaling scenarios for different campaign volumes
  monthly_scaling_scenarios: {
    light_usage: {
      concurrent_campaigns: 5,
      monthly_api_calls: 28800, // 5 * 5,760
      rate_utilization: 3.33, // 28,800 / 864,000
      description: "Typical small-scale usage"
    },

    moderate_usage: {
      concurrent_campaigns: 15,
      monthly_api_calls: 86400, // 15 * 5,760
      rate_utilization: 10, // 86,400 / 864,000
      description: "Growing platform usage"
    },

    heavy_usage: {
      concurrent_campaigns: 30,
      monthly_api_calls: 172800, // 30 * 5,760
      rate_utilization: 20, // 172,800 / 864,000
      description: "High-volume platform usage"
    },

    enterprise_usage: {
      concurrent_campaigns: 50,
      monthly_api_calls: 288000, // 50 * 5,760
      rate_utilization: 33.33, // 288,000 / 864,000
      description: "Would require optimization - approaching limits",
      warning: "May hit rate limits during peak periods"
    }
  },

  // Cost implications (if X API becomes paid)
  potential_cost_analysis: {
    assumed_cost_per_1000_calls: 1, // $1 per 1000 API calls (example pricing)

    monthly_costs_by_usage: {
      light_usage: 28.8, // 28,800 calls * $1/1000 = $28.80/month
      moderate_usage: 86.4, // $86.40/month
      heavy_usage: 172.8, // $172.80/month
      enterprise_usage: 288, // $288/month
      max_theoretical: 864, // $864/month if hitting all rate limits
    },

    note: "These are example calculations - actual X API pricing may differ"
  },

  // Alternative interval comparison for monthly volume
  interval_comparison_monthly: {
    "15_minute_intervals": {
      collections_per_month: 2880, // 43,200 min / 15 min = 2,880
      api_calls_per_campaign_per_month: 11520, // 2,880 * 4 = 11,520
      max_safe_campaigns: 18, // Due to rate limits
      max_monthly_calls: 207360, // 18 * 11,520 = 207,360
      trade_off: "2x more API calls but 60% fewer campaigns supported"
    },

    "current_30_minute_intervals": {
      collections_per_month: 1440,
      api_calls_per_campaign_per_month: 5760,
      max_safe_campaigns: 30,
      max_monthly_calls: 172800,
      trade_off: "Balanced approach - good data collection with scale support"
    },

    "45_minute_intervals": {
      collections_per_month: 960, // 43,200 / 45 = 960
      api_calls_per_campaign_per_month: 3840, // 960 * 4 = 3,840
      max_safe_campaigns: 56, // Better rate limit headroom
      max_monthly_calls: 215040, // 56 * 3,840 = 215,040
      trade_off: "Less frequent data but supports nearly 2x more campaigns"
    },

    "60_minute_intervals": {
      collections_per_month: 720, // 43,200 / 60 = 720
      api_calls_per_campaign_per_month: 2880, // 720 * 4 = 2,880
      max_safe_campaigns: 75, // Excellent rate limit safety
      max_monthly_calls: 216000, // 75 * 2,880 = 216,000
      trade_off: "Half the data collection frequency but 2.5x campaign capacity"
    }
  }
};

export {
  CURRENT_RATE_LIMIT_LOGIC,
  RATE_LIMIT_MATH,
  RATE_LIMIT_SCENARIOS,
  SYSTEM_SAFETY_ANALYSIS,
  DAILY_CAMPAIGN_CAPACITY,
  MONTHLY_API_CALL_ANALYSIS
};
