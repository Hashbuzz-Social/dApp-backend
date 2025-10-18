# X API Rate Limiting System - Implementation Prompt

## Project Overview

Build a robust Node.js Express system with TypeScript to handle X (Twitter) API rate limiting for promotional campaigns on the Basic tier. The system must manage two campaign types while respecting strict endpoint-specific rate limits and monthly post consumption caps.

## Business Requirements

### Campaign Types

1. **Quest Campaigns** (15-minute duration)
   - Fetch user IDs and comment content for replies and quotes
   - Minimum API calls: 1 Recent Search request

2. **Awareness Campaigns** (60-minute duration)
   - Fetch user IDs for likes, reposts, replies, and quotes
   - Minimum API calls: 3 Recent Search + 1 Liking Users requests

### X API Constraints (Basic Tier - OAuth 2.0 Bearer Token)

#### Endpoint-Specific Rate Limits (per app, per 15-minute window)
- **Recent Search** `/2/tweets/search/recent`: 60 requests/15min
- **Liking Users** `/2/tweets/:id/liking_users`: 25 requests/15min
- **Quote Tweets** `/2/tweets/:id/quote_tweets`: 5 requests/15min (avoid)
- **Retweet By** `/2/tweets/:id/retweeted_by`: 5 requests/15min (avoid)

#### Critical Constraints
- **Monthly Post Cap**: 15,000 posts/month at Project level
- **Liking Users Cap**: Max 100 liking accounts per post (lifetime)
- **Pagination**: Up to 100 results per request with `next_token`
- **Project Limits**: 1 Project with up to 2 Apps per Project
- **Rate Limit Headers**: `x-rate-limit-limit`, `x-rate-limit-remaining`, `x-rate-limit-reset`

### Mathematical Constraints

Let `Q` = Quest campaigns finishing in a 15-minute window, `A` = Awareness campaigns:

```
Constraint 1: Q + 3A ≤ 60  (Recent Search budget)
Constraint 2: A ≤ 25        (Liking Users budget)
```

**Maximum throughput per window:**
- Quest-only: 60 campaigns/15min
- Awareness-only: 20 campaigns/15min (Recent Search is bottleneck)
- Mixed example: Q=15, A=10 → Valid (15 + 30 = 45 ≤ 60, 10 ≤ 25)

### API Strategy

**IMPORTANT: Use Recent Search for replies, quotes, and reposts** (not dedicated endpoints)

Search operators:
- Replies: `in_reply_to_tweet_id:<POST_ID>`
- Quotes: `quotes_of_tweet_id:<POST_ID>`
- Reposts: `retweets_of_tweet_id:<POST_ID>`

Always use `max_results=100` and paginate only when needed.

## System Architecture

### Core Components Required

#### 1. Rate Limit Manager
```typescript
interface WindowPool {
  endpoint: string;
  limit: number;
  remaining: number;
  resetTime: Date;
}
```
- Track separate pools for each endpoint
- Update from response headers on every API call
- Persist in Redis with TTLs aligned to reset times
- Handle exponential backoff on 429 errors

#### 2. Post Cap Manager
```typescript
interface PostCapTracker {
  monthlyLimit: 15000;
  consumed: number;
  dailyBudget: number;  // ~500 posts/day for safety margin
  resetDate: Date;
}
```
- Track posts returned (not requests made)
- Implement daily budgeting to prevent month-end exhaustion
- Account for pagination (each page = up to 100 posts)

#### 3. Campaign Cost Calculator
```typescript
type CostVector = {
  recent: number;
  likes: number;
}

function calculateCost(type: 'Quest' | 'Awareness'): CostVector {
  return type === 'Quest'
    ? { recent: 1, likes: 0 }
    : { recent: 3, likes: 1 };
}
```

#### 4. Campaign Scheduler
- Group jobs by 15-minute windows
- Admission control: check if campaign fits current window budgets
- Queue campaigns that don't fit for next window
- Process queue on window resets

#### 5. X API Client Wrapper
- Parse `x-rate-limit-*` headers on every response
- Automatically update pool states
- Implement exponential backoff for 429 errors
- Retry until `x-rate-limit-reset` time

#### 6. Job Queue System
```typescript
interface CampaignJob {
  id: string;
  type: 'Quest' | 'Awareness';
  tweetId: string;
  tenant: string;
  priority: number;
  scheduledWindow: Date;
}
```

#### 7. Multi-Tenant Support
- Per-tenant credit buckets within global constraints
- Round-robin admission when resources scarce
- Optional per-tenant daily post-cap slicing

#### 8. Two-App Scaling
- Basic tier allows 2 apps per project
- App-level: rate limits per app (can double request throughput)
- Project-level: post cap shared across both apps (still 15,000 total)

### Data Flow

```
Campaign Ends → Scheduler → Admission Check → Queue/Execute
                                ↓
                         Update Pools from Headers
                                ↓
                         X API Client → Paginate → Store Results
```

### Redis Schema Design

```redis
# Rate limit pools (TTL = reset time)
pools:recent_search = {limit: 60, remaining: 45, reset: 1696789200}
pools:liking_users = {limit: 25, remaining: 20, reset: 1696789200}

# Post cap tracking
post_cap:monthly = {consumed: 5000, reset: "2025-11-01"}
post_cap:daily = {consumed: 200, reset: "2025-10-09"}

# Job queues (sorted sets by priority)
queue:window:1696789200 = [{campaign_id: "123", priority: 1, tenant: "A"}]

# Campaign state
campaign:123 = {status: "processing", type: "Quest", results: {...}}
```

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Initialize Node.js Express project with TypeScript
- [ ] Install dependencies: express, axios, redis, ioredis, node-cron
- [ ] Set up development tools: nodemon, typescript, eslint, prettier
- [ ] Configure environment variables for X API credentials and Redis

### Phase 2: Rate Limit Management
- [ ] Create `WindowPool` class with Redis persistence
- [ ] Implement pools for: recent_search, liking_users, quote_tweets, retweeted_by
- [ ] Build header parser to extract `x-rate-limit-*` values
- [ ] Add automatic pool state updates on every API response

### Phase 3: Post Cap Tracking
- [ ] Implement `PostCapManager` with monthly 15,000 limit
- [ ] Add daily budgeting logic (~500 posts/day)
- [ ] Track posts returned from paginated responses
- [ ] Create overflow protection and deferral logic

### Phase 4: Campaign Logic
- [ ] Build cost vector calculator (Quest vs Awareness)
- [ ] Implement admission control with Q + 3A ≤ 60 and A ≤ 25 checks
- [ ] Create 15-minute window bucketing system
- [ ] Build job queue with priority ordering

### Phase 5: X API Integration
- [ ] Create X API client wrapper with axios
- [ ] Implement Recent Search handler with search operators
  - Replies: `in_reply_to_tweet_id:<ID>`
  - Quotes: `quotes_of_tweet_id:<ID>`
  - Reposts: `retweets_of_tweet_id:<ID>`
- [ ] Implement Liking Users handler with 100-user cap awareness
- [ ] Add pagination logic with `next_token` and `max_results=100`
- [ ] Implement exponential backoff for 429 errors

### Phase 6: Scheduler & Queue
- [ ] Build campaign scheduler with window-based admission
- [ ] Implement job queue persistence in Redis
- [ ] Create automatic queue processing on window resets
- [ ] Add job state tracking (pending, processing, completed, failed)

### Phase 7: Multi-Tenant Support
- [ ] Add per-tenant credit buckets
- [ ] Implement round-robin admission logic
- [ ] Create optional per-tenant post-cap slicing
- [ ] Add tenant isolation and fairness guarantees

### Phase 8: Two-App Scaling
- [ ] Implement app-level traffic distribution
- [ ] Add shared Project-level post cap tracking
- [ ] Create load balancing logic across 2 apps
- [ ] Handle app-specific credential management

### Phase 9: API Endpoints
- [ ] `POST /campaigns` - Submit new campaign
- [ ] `GET /campaigns/:id` - Get campaign status and results
- [ ] `GET /pools` - View current rate limit states
- [ ] `GET /stats` - System usage metrics and health
- [ ] `GET /tenants/:id/quota` - Tenant-specific quotas

### Phase 10: Background Processing
- [ ] Create worker process for executing queued jobs
- [ ] Implement jitter for API call timing
- [ ] Add result storage and campaign state updates
- [ ] Create automatic pool refresh on window resets

### Phase 11: Resilience & Error Handling
- [ ] Implement exponential backoff with jitter
- [ ] Add circuit breakers for failing endpoints
- [ ] Create dead letter queue for failed jobs
- [ ] Implement graceful degradation patterns
- [ ] Add comprehensive error logging

### Phase 12: Monitoring & Observability
- [ ] Set up Winston for structured logging
- [ ] Add Prometheus metrics export
- [ ] Create health check endpoints
- [ ] Build dashboard for pool status visualization
- [ ] Add alerts for queue depth and cap consumption

### Phase 13: Testing
- [ ] Unit tests for WindowPool, PostCapManager, cost calculator
- [ ] Integration tests for API flows with mock X API
- [ ] Load tests for concurrent campaign scenarios
- [ ] Test Q + 3A ≤ 60 constraint enforcement
- [ ] Test pagination and post cap tracking

### Phase 14: Documentation & Deployment
- [ ] Create API documentation (OpenAPI/Swagger)
- [ ] Write operational runbooks
- [ ] Create Docker containerization
- [ ] Set up CI/CD pipeline
- [ ] Write deployment guides

## Critical Implementation Rules

1. **Never use a global rate limit pool** - X has endpoint-specific limits
2. **Always prefer Recent Search** over quote/repost list endpoints (60/15m vs 5/15m)
3. **Read headers on every response** - Trust X's state over local calculations
4. **Track posts returned, not requests made** - Pagination affects post cap
5. **Implement exponential backoff** - Back off until `x-rate-limit-reset`
6. **Use 15-minute window buckets** - All planning must align to these windows
7. **Paginate conservatively** - Each page consumes post cap budget
8. **Monitor the 100-liker cap** - Liking Users returns max 100 per post lifetime

## Example Pseudocode

```typescript
// Admission control
function tryAdmit(job: CampaignJob, pools: Pools, capRemaining: number): boolean {
  const cost = calculateCost(job.type);
  const postsEstimate = job.type === 'Quest' ? 200 : 300; // 2-3 pages typical

  if (pools.recent.remaining < cost.recent) return false;
  if (pools.likes.remaining < cost.likes) return false;
  if (capRemaining < postsEstimate) return false;

  reserve(pools, cost);
  reserveCap(postsEstimate);
  dispatch(job);
  return true;
}

// X API call with header parsing
async function makeRecentSearch(query: string): Promise<SearchResult> {
  const response = await axios.get('/2/tweets/search/recent', {
    params: { query, max_results: 100 },
    headers: { Authorization: `Bearer ${token}` }
  });

  // Update pool from headers
  pools.recent_search.remaining = parseInt(response.headers['x-rate-limit-remaining']);
  pools.recent_search.reset = new Date(parseInt(response.headers['x-rate-limit-reset']) * 1000);

  // Track posts returned
  postCapManager.increment(response.data.meta.result_count);

  return response.data;
}
```

## Expected Deliverables

1. Fully functional Node.js Express API with TypeScript
2. Rate limit management system with Redis persistence
3. Campaign scheduler with 15-minute window logic
4. X API integration with proper error handling
5. Multi-tenant support with fairness guarantees
6. Monitoring dashboard and metrics
7. Comprehensive test suite
8. Docker deployment setup
9. API documentation
10. Operational runbooks

## Success Criteria

- System enforces Q + 3A ≤ 60 and A ≤ 25 constraints per 15-minute window
- Never exceeds 15,000 posts/month consumption cap
- Properly handles 429 errors with exponential backoff
- Tracks and updates rate limit state from response headers
- Supports multiple tenants with fair resource allocation
- Can scale across 2 apps while sharing post cap
- Provides visibility into pool states and queue depth
- Handles concurrent campaign submissions gracefully
- Automatically queues and processes campaigns on window resets

## Reference Documentation

- X API Rate Limits: https://docs.x.com/x-api/fundamentals/rate-limits
- X API Post Cap: https://docs.x.com/x-api/fundamentals/post-cap
- Recent Search: https://docs.x.com/x-api/posts/recent-search
- Search Operators: https://docs.x.com/x-api/posts/search/integrate/build-a-query
- Liking Users: https://docs.x.com/x-api/posts/likes/introduction

## Notes

- This system is designed for X API Basic tier (OAuth 2.0 app-only authentication)
- Post cap is at Project level and shared across all apps in the project
- Real-world throughput depends on pagination - viral content increases costs
- Daily budgeting prevents month-end quota exhaustion
- Deduplication is daily, not per request at X's side

---

**Start with Phase 1-2 to build the foundation, then progressively add features through Phase 14.**
