# Engagement Collection Options

**Date:** January 2025
**Version:** 0.201.23+
**Module:** `src/V201/Modules/engagements/XEngagementCollectionHelpers.ts`

---

## Overview

The engagement collection functions now support **granular control** over what data to fetch from Twitter API. This allows you to:

- Fetch only quotes (skip replies)
- Fetch only replies (skip quotes)
- Fetch both quotes and replies (default)
- Fetch neither (return empty results)

This is useful for:
- **Rate limit optimization** - Don't fetch data you don't need
- **Performance** - Reduce API calls and processing time
- **Debugging** - Isolate specific data collection issues
- **Testing** - Test quote and reply collection independently

---

## API Changes

### CollectionOptions Interface

```typescript
interface CollectionOptions {
  /** Whether to fetch quote tweets (default: true) */
  fetchQuotes?: boolean;
  /** Whether to fetch reply tweets (default: true) */
  fetchReplies?: boolean;
}
```

### Updated Function Signatures

#### `collectQuotesAndRepliesWithUsers()`

**Before:**
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

**After:**
```typescript
const collectQuotesAndRepliesWithUsers = async (
  tweetId: string,
  userBizCredentials: UserBizXCredentials,
  timestamp?: string | Date,
  options: CollectionOptions = {}  // ← NEW PARAMETER
): Promise<{
  quotes: { tweets: TweetV2[]; users: Map<string, UserV2> };
  replies: { tweets: TweetV2[]; users: Map<string, UserV2> };
}>
```

#### `collectQuotesAndReplies()`

**Before:**
```typescript
const collectQuotesAndReplies = async (
  tweetId: string,
  userBizCredentials: UserBizXCredentials,
  timestamp?: string | Date
)
```

**After:**
```typescript
const collectQuotesAndReplies = async (
  tweetId: string,
  userBizCredentials: UserBizXCredentials,
  timestamp?: string | Date,
  options: CollectionOptions = {}  // ← NEW PARAMETER
)
```

---

## Usage Examples

### Example 1: Default Behavior (Fetch Both)

```typescript
import { collectQuotesAndRepliesWithUsers } from '@V201/Modules/engagements/XEngagementCollectionHelpers';

// Fetches both quotes and replies (default)
const result = await collectQuotesAndRepliesWithUsers(
  tweetId,
  userBizCredentials,
  timestamp
);

console.log(result.quotes.tweets.length);  // All quote tweets
console.log(result.replies.tweets.length); // All reply tweets
```

### Example 2: Fetch Only Replies (Skip Quotes)

```typescript
// Only fetch replies, skip quotes to save rate limits
const result = await collectQuotesAndRepliesWithUsers(
  tweetId,
  userBizCredentials,
  timestamp,
  { fetchQuotes: false, fetchReplies: true }
);

console.log(result.quotes.tweets.length);  // 0 (empty array)
console.log(result.replies.tweets.length); // All reply tweets
```

### Example 3: Fetch Only Quotes (Skip Replies)

```typescript
// Only fetch quotes, skip replies
const result = await collectQuotesAndRepliesWithUsers(
  tweetId,
  userBizCredentials,
  timestamp,
  { fetchQuotes: true, fetchReplies: false }
);

console.log(result.quotes.tweets.length);  // All quote tweets
console.log(result.replies.tweets.length); // 0 (empty array)
```

### Example 4: Skip Both (Testing/Debugging)

```typescript
// Fetch neither (useful for testing other parts of workflow)
const result = await collectQuotesAndRepliesWithUsers(
  tweetId,
  userBizCredentials,
  timestamp,
  { fetchQuotes: false, fetchReplies: false }
);

console.log(result.quotes.tweets.length);  // 0 (empty array)
console.log(result.replies.tweets.length); // 0 (empty array)
```

### Example 5: Using with Simple Function

```typescript
import { collectQuotesAndReplies } from '@V201/Modules/engagements/XEngagementCollectionHelpers';

// Works with simple function too (no user data)
const result = await collectQuotesAndReplies(
  tweetId,
  userBizCredentials,
  timestamp,
  { fetchQuotes: true, fetchReplies: false }
);

console.log(result.quotes.length);  // TweetV2[]
console.log(result.replies.length); // [] (empty)
```

---

## Use Cases

### 1. Rate Limit Optimization

If you're hitting Twitter API rate limits, you can collect data in stages:

```typescript
// Step 1: Collect likes and retweets (no rate limit issues)
const { likes, retweets } = await collectLikesAndRetweets(
  tweetId,
  userBizCredentials
);

// Step 2: Collect only replies (most important)
const { replies } = await collectQuotesAndRepliesWithUsers(
  tweetId,
  userBizCredentials,
  timestamp,
  { fetchQuotes: false, fetchReplies: true }
);

// Step 3: Later, collect quotes if rate limits allow
const { quotes } = await collectQuotesAndRepliesWithUsers(
  tweetId,
  userBizCredentials,
  timestamp,
  { fetchQuotes: true, fetchReplies: false }
);
```

### 2. Error Recovery

If quote collection fails, you can still get replies:

```typescript
try {
  const result = await collectQuotesAndRepliesWithUsers(
    tweetId,
    userBizCredentials,
    timestamp
  );
  return result;
} catch (error) {
  logger.warn('Full collection failed, falling back to replies only');

  // Fallback: Only collect replies
  return await collectQuotesAndRepliesWithUsers(
    tweetId,
    userBizCredentials,
    timestamp,
    { fetchQuotes: false, fetchReplies: true }
  );
}
```

### 3. Campaign Closing Workflow

Disable quotes collection for campaigns that don't need it:

```typescript
// In campaign closing worker
const campaignType = campaign.campaign_type;

const collectionOptions: CollectionOptions = {
  fetchQuotes: campaignType === 'QUOTE_CONTEST', // Only for quote contests
  fetchReplies: true, // Always collect replies
};

const { quotes, replies } = await collectQuotesAndRepliesWithUsers(
  tweetId,
  userBizCredentials,
  campaign.end_date,
  collectionOptions
);
```

### 4. Testing Individual Endpoints

Test quote and reply collection separately:

```typescript
// Test quote collection in isolation
describe('Quote Collection', () => {
  it('should collect quotes correctly', async () => {
    const result = await collectQuotesAndRepliesWithUsers(
      mockTweetId,
      mockCredentials,
      undefined,
      { fetchQuotes: true, fetchReplies: false }
    );

    expect(result.quotes.tweets.length).toBeGreaterThan(0);
    expect(result.replies.tweets.length).toBe(0);
  });
});

// Test reply collection in isolation
describe('Reply Collection', () => {
  it('should collect replies correctly', async () => {
    const result = await collectQuotesAndRepliesWithUsers(
      mockTweetId,
      mockCredentials,
      undefined,
      { fetchQuotes: false, fetchReplies: true }
    );

    expect(result.quotes.tweets.length).toBe(0);
    expect(result.replies.tweets.length).toBeGreaterThan(0);
  });
});
```

---

## Implementation Details

### How It Works

1. **Promise Construction:**
   - If `fetchQuotes === false`, quote promise is set to `null`
   - If `fetchReplies === false`, reply promise is set to `null`

2. **Promise Execution:**
   - `null` promises are converted to `Promise.resolve([])` or `Promise.resolve({ tweets: [], users: new Map() })`
   - All promises execute in parallel via `Promise.all()`

3. **Result Assembly:**
   - Results are destructured into `quotes` and `replies`
   - Empty arrays/maps returned for skipped collections

### Performance Impact

**Fetching Both (Default):**
- 2 API calls (1 quote, 1 reply)
- Full rate limit usage

**Fetching One:**
- 1 API call
- 50% rate limit savings

**Fetching Neither:**
- 0 API calls
- 100% rate limit savings (useful for testing)

### Backward Compatibility

✅ **Fully backward compatible!**

Existing code continues to work without changes:

```typescript
// Old code still works (default: fetch both)
const result = await collectQuotesAndRepliesWithUsers(
  tweetId,
  userBizCredentials,
  timestamp
);
```

---

## Configuration Examples

### Environment-Based Configuration

```typescript
// .env or config file
FETCH_QUOTES_ON_CLOSING=false
FETCH_REPLIES_ON_CLOSING=true

// In code
const collectionOptions: CollectionOptions = {
  fetchQuotes: process.env.FETCH_QUOTES_ON_CLOSING === 'true',
  fetchReplies: process.env.FETCH_REPLIES_ON_CLOSING === 'true',
};

const result = await collectQuotesAndRepliesWithUsers(
  tweetId,
  userBizCredentials,
  timestamp,
  collectionOptions
);
```

### Campaign-Specific Configuration

```typescript
// Store in campaign metadata
interface CampaignMetadata {
  collectQuotes: boolean;
  collectReplies: boolean;
}

// Use during closing
const metadata = campaign.metadata as CampaignMetadata;

const result = await collectQuotesAndRepliesWithUsers(
  tweetId,
  userBizCredentials,
  campaign.end_date,
  {
    fetchQuotes: metadata?.collectQuotes ?? true,
    fetchReplies: metadata?.collectReplies ?? true,
  }
);
```

---

## Related Changes

- **Twitter API Fix:** Removed unsupported `end_time` parameter from quotes endpoint
- **Client-Side Filtering:** Added timestamp filtering in application code
- **Retry Logic:** Disabled retries for `CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY`

---

## Migration Guide

### Updating Existing Code

**Option 1: No Changes (Recommended for Most Cases)**
```typescript
// Keep existing code as-is, default behavior unchanged
const result = await collectQuotesAndRepliesWithUsers(
  tweetId,
  userBizCredentials,
  timestamp
);
```

**Option 2: Explicit Configuration**
```typescript
// Explicitly set what to fetch
const result = await collectQuotesAndRepliesWithUsers(
  tweetId,
  userBizCredentials,
  timestamp,
  { fetchQuotes: true, fetchReplies: true } // Same as default
);
```

**Option 3: Selective Collection**
```typescript
// Only collect what you need
const result = await collectQuotesAndRepliesWithUsers(
  tweetId,
  userBizCredentials,
  timestamp,
  { fetchQuotes: false, fetchReplies: true } // Optimize rate limits
);
```

---

## Testing

```bash
# Run tests
npm run test:v201:safe --test-db

# Specific engagement collection tests
npm test -- --grep "engagement collection"
```

---

## References

- **Twitter API Fix:** `docs/TWITTER_QUOTES_ENDPOINT_FIX.md`
- **Engagement Collection:** `src/V201/Modules/engagements/XEngagementCollectionHelpers.ts`
- **Campaign Events:** `src/V201/AppEvents/campaign.ts`
- **Retry Configuration:** `src/V201/enhancedEventSystem.ts`

---

**Status:** ✅ Complete and Backward Compatible
**Build:** ✅ Passing
**TypeScript:** ✅ No Errors
