# Bot Detection Implementation - Option A

## Overview
Implemented bot detection for quote and reply engagements using **Option A**: Fetch user details while collecting engagements from Twitter API.

## Implementation Date
October 19, 2025

## Approach
Bot detection is performed **during engagement collection** by extracting user data from Twitter API's `response.includes.users` when collecting quotes and replies.

## Files Modified

### 1. `/src/shared/twitterAPI.ts`
**Changes:**
- Enhanced `getAllQuotesWithUsers()` to extract user data from `response.includes.users`
- Enhanced `getAllRepliesWithUsers()` to extract user data from `response.includes.users`
- Both functions now return `EnhancedTweetResult` with `{tweets: TweetV2[], users: Map<string, UserV2>}`
- Added functions to default export

**Key Implementation:**
```typescript
// Extract users from the paginator response
if (quotesResponse.includes?.users) {
  for (const user of quotesResponse.includes.users) {
    users.set(user.id, user);
  }
}
```

### 2. `/src/V201/Modules/engagements/XEngagementCollectionHelpers.ts`
**Changes:**
- Added `collectQuotesAndRepliesWithUsers()` function
- Returns structured data with both tweets and users for bot detection
- Maintains backward compatibility with `collectQuotesAndReplies()` for simple use cases

**Function Signature:**
```typescript
const collectQuotesAndRepliesWithUsers = async (
  tweetId: string,
  userBizCredentials: UserBizXCredentials,
  timestamp?: string | Date
): Promise<{
  quotes: { tweets: TweetV2[]; users: Map<string, UserV2> };
  replies: { tweets: TweetV2[]; users: Map<string, UserV2> };
}>
```

### 3. `/src/V201/Modules/campaigns/services/campaignClose/OnCloseEngagementService.ts`
**Changes:**
- Updated `processQuoteAndReplyCollection()` to use `collectQuotesAndRepliesWithUsers()`
- Implemented bot detection logic inline using `detectBotEngagement()` from bot detection module
- Calculate `is_bot_engagement` based on user metrics for each engagement
- Track bot detection stats (botDetectedCount, validEngagementCount)
- Log bot detection results

**Bot Detection Flow:**
```typescript
const user = quotes.users.get(String(tweet.author_id));
if (user) {
  const botMetrics = detectBotEngagement(user);
  isBotEngagement = botMetrics.isBotEngagement;

  if (isBotEngagement) {
    logger.info(`Bot detected: ${getBotDetectionSummary(botMetrics)}`);
  }
}
```

## Bot Detection Metrics

### Thresholds (from `botDetection.ts`)
- **Account Age:** < 30 days → `NEW_ACCOUNT` flag
- **Follower Ratio:** > 50 (following/followers) → `HIGH_FOLLOWER_RATIO` flag
- **Tweet Rate:** > 100 tweets/day → `HIGH_TWEET_RATE` flag

### Calculations
1. **Account Age:** `current date - user.created_at`
2. **Follower Ratio:** `following ÷ max(1, followers)`
3. **Tweet Rate:** `total tweets ÷ account age (in days)`

### User Fields Requested
The Twitter API requests these fields for bot detection:
- `username`
- `created_at` (for account age)
- `public_metrics` (followers, following, tweet count)
- `verified` (verification status)
- `description` (bio)
- `location`

## Database Schema
The `is_bot_engagement` field in `campaign_tweet_engagement` table is now populated with **calculated boolean values** based on bot detection metrics, not hardcoded.

## Logging
Each bot detection result is logged with details:
```
Bot detected in quote: NEW_ACCOUNT (age: 15 days) - User: 1234567890
Bot detected in reply: HIGH_FOLLOWER_RATIO (ratio: 75.5) - User: 9876543210
```

Campaign completion logs include bot detection stats:
```json
{
  "quotesCollected": 150,
  "repliesCollected": 200,
  "botDetectedCount": 25,
  "validEngagementCount": 325
}
```

## Benefits of Option A

✅ **Single API Call:** No separate user lookup needed
✅ **Efficient:** User data already in Twitter API response
✅ **Real-time:** Bot detection happens during collection
✅ **Accurate:** Uses fresh data from Twitter API
✅ **No Extra Rate Limits:** Reuses existing API calls

## Performance Considerations

- User data is extracted from `response.includes.users` which is already fetched
- No additional API calls required
- Bot detection adds minimal processing time (simple math calculations)
- User data stored in `Map<string, UserV2>` for O(1) lookup

## Testing Recommendations

1. **Test with Known Bot Accounts:**
   - New accounts (< 30 days)
   - High follower ratio accounts
   - High tweet rate accounts

2. **Test Campaign Closing:**
   - Run a campaign close event
   - Verify bot detection metrics in logs
   - Check database for correct `is_bot_engagement` values

3. **Performance Test:**
   - Test with large engagement volumes (1000+ quotes/replies)
   - Monitor memory usage for user data maps
   - Check API response times

## Future Enhancements

1. **Configurable Thresholds:** Make bot detection thresholds configurable per campaign
2. **Machine Learning:** Add ML-based bot detection for more sophisticated patterns
3. **Bot Score:** Instead of boolean, use a 0-100 bot confidence score
4. **Whitelist:** Allow campaign owners to whitelist specific accounts

## Related Files
- `/src/V201/Modules/engagements/botDetection.ts` - Bot detection logic and thresholds
- `/prisma/schema.prisma` - Database schema with `is_bot_engagement` field
