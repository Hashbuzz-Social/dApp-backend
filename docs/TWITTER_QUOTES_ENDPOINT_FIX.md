# Twitter Quotes Endpoint Fix - Time Parameter Issue

**Date:** January 2025
**Version:** 0.201.23+
**Issue:** Campaign closing fails with Twitter API 400 error on quote tweet collection

---

## Problem Summary

Campaign closing operations were failing during the `CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY` BullMQ job step due to an incorrect API parameter being sent to Twitter's `/tweets/:id/quote_tweets` endpoint.

### Error Message

```
Error: Request failed with code 400

The query parameter [end_time] is not one of [id,max_results,pagination_token,exclude,
expansions,tweet.fields,media.fields,poll.fields,place.fields,user.fields]

Header: x-rate-limit-remaining: 74
```

### Root Cause

Two functions in `src/shared/twitterAPI.ts` were incorrectly sending `start_time` and `end_time` parameters to the Twitter API v2 **quotes endpoint** (`/tweets/:id/quote_tweets`):

1. **`getAllUsersWhoQuotedOnTweetId()`** - Lines 467-470
2. **`getAllQuotesWithUsers()`** - Lines 844-847

The quotes endpoint **does not support time-based filtering parameters**. According to Twitter API v2 documentation, the `/quotes` endpoint only accepts:
- `id` (required)
- `max_results`
- `pagination_token`
- `exclude`
- `expansions`
- `tweet.fields`
- `media.fields`
- `poll.fields`
- `place.fields`
- `user.fields`

**Time filtering parameters are NOT supported.**

### Impact

- Campaign 9 (and potentially others) failed at quote/reply collection step
- First attempt resulted in 400 error
- Retry logic attempted same request, hit rate limit (429 error)
- Campaign closing workflow blocked

---

## Solution Implemented

### Code Changes

**File:** `src/shared/twitterAPI.ts`

#### 1. `getAllUsersWhoQuotedOnTweetId()` (Lines ~445-475)

**Before:**
```typescript
const searchParams: Partial<Tweetv2SearchParams> = {
  // ... other params
  max_results: options?.maxResults || 100,
  ...(options?.startTime && {
    start_time: normalizeTimestamp(options.startTime),
  }),
  ...(options?.endTime && {
    end_time: normalizeTimestamp(options.endTime),
  }),
} as any;

const quotes = await twitterClient.readOnly.v2.quotes(tweetId, searchParams);
```

**After:**
```typescript
const searchParams: Partial<Tweetv2SearchParams> = {
  // ... other params
  max_results: options?.maxResults || 100,
  // NOTE: /quotes endpoint does NOT support start_time/end_time parameters
  // Filtering is done client-side below
} as any;

const quotes = await twitterClient.readOnly.v2.quotes(tweetId, searchParams);
```

**Existing client-side filtering was already in place** (line 482-484):
```typescript
// Apply client-side filtering if timestamp options provided but API doesn't support them natively
if (options?.startTime || options?.endTime) {
  return filterByTimestamp(data, options);
}
```

#### 2. `getAllQuotesWithUsers()` (Lines ~825-870)

**Before:**
```typescript
const searchParams: Partial<Tweetv2SearchParams> = {
  // ... other params
  max_results: options?.maxResults || 100,
  ...(options?.startTime && {
    start_time: normalizeTimestamp(options.startTime),
  }),
  ...(options?.endTime && {
    end_time: normalizeTimestamp(options.endTime),
  }),
} as any;

const quotesResponse = await twitterClient.readOnly.v2.quotes(tweetId, searchParams);

// ... collect tweets and users

return { tweets, users };
```

**After:**
```typescript
const searchParams: Partial<Tweetv2SearchParams> = {
  // ... other params
  max_results: options?.maxResults || 100,
  // NOTE: /quotes endpoint does NOT support start_time/end_time parameters
  // Filtering is done client-side below
} as any;

const quotesResponse = await twitterClient.readOnly.v2.quotes(tweetId, searchParams);

// ... collect tweets and users

// Apply client-side filtering if timestamp options provided (API doesn't support them natively)
let filteredTweets = tweets;
if (options?.startTime || options?.endTime) {
  filteredTweets = filterByTimestamp(tweets, options);
}

return { tweets: filteredTweets, users };
```

**Added client-side filtering** using the existing `filterByTimestamp()` helper function.

---

## Verification Steps

### 1. Build Test
```bash
cd /home/hashbuzz-social/Desktop/hashbuzz/dApp-backend
npm run build
```
✅ **Result:** Build successful (0.201.23)

### 2. TypeScript Validation
```bash
npx tsc --noEmit
```
✅ **Result:** No type errors

### 3. Campaign Closing Test (Manual)

**Prerequisites:**
- Active campaign with published tweets
- Campaign ready for closing
- User with valid Twitter credentials

**Steps:**
1. Trigger campaign closing via admin dashboard or API
2. Monitor BullMQ job: `CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY`
3. Check logs for quote/reply collection
4. Verify no 400 errors from Twitter API
5. Confirm campaign closes successfully

**Expected Behavior:**
- ✅ Quote tweets collected without 400 error
- ✅ Client-side timestamp filtering applies correctly
- ✅ Campaign closing completes successfully
- ✅ Engagement data saved to database

---

## Technical Details

### How Client-Side Filtering Works

The `filterByTimestamp()` function (located in `twitterAPI.ts` around line 291) filters tweets by `created_at` field:

```typescript
function filterByTimestamp<T extends { created_at?: string }>(
  items: T[],
  options: TimestampFilter
): T[] {
  return items.filter((item) => {
    if (!item.created_at) return false;
    const itemDate = new Date(item.created_at);
    if (options.startTime && itemDate < new Date(options.startTime)) return false;
    if (options.endTime && itemDate > new Date(options.endTime)) return false;
    return true;
  });
}
```

### Performance Considerations

**Server-Side Filtering (Not Possible):**
- Would filter at Twitter API level
- Reduces data transfer
- **Not supported by /quotes endpoint**

**Client-Side Filtering (Implemented):**
- Fetches ALL quote tweets from API
- Filters in application code
- More data transfer, but necessary

**Recommendation:** For high-volume campaigns, consider:
1. Caching quote results
2. Paginating requests with `max_results` and `pagination_token`
3. Implementing incremental collection

---

## Related Files

### Modified
- ✅ `src/shared/twitterAPI.ts` - Removed unsupported parameters, added client-side filtering

### Affected (No Changes Needed)
- `src/V201/Modules/engagements/XEngagementCollectionHelpers.ts` - Uses fixed functions
- `src/services/twitterCard-service.ts` - Uses fixed functions
- `src/V201/Modules/campaigns/workers/closeCardCampaign/steps/collectEngagementData.ts` - BullMQ step

---

## API Endpoint Comparison

| Endpoint | Supports Time Filtering? | Method |
|----------|------------------------|--------|
| `/tweets/:id/quote_tweets` | ❌ No | Client-side filtering required |
| `/tweets/search/recent` | ✅ Yes (`start_time`, `end_time`) | Server-side filtering |
| `/tweets/:id/retweeting_users` | ❌ No | Not filterable |
| `/tweets/:id/liking_users` | ❌ No | Not filterable |

**Note:** Reply collection uses `/tweets/search/recent` endpoint (`in_reply_to_tweet_id:` query), which **does support** time parameters. This remains unchanged.

---

## Testing Checklist

- [x] TypeScript compilation passes
- [x] Build succeeds
- [x] No ESLint errors
- [ ] Campaign closing completes without 400 error
- [ ] Quote tweets filtered correctly by timestamp
- [ ] Reply tweets still filtered correctly (uses search endpoint)
- [ ] Rate limit handling works as expected
- [ ] Bot detection still functions (user data preserved)

---

## References

- **Twitter API v2 Documentation:** https://developer.twitter.com/en/docs/twitter-api/tweets/quote-tweets/api-reference
- **Campaign Closing Architecture:** `docs/CAMPAIGN_PUBLISHING_ARCHITECTURE.md`
- **Bot Detection Implementation:** `docs/BOT_DETECTION_IMPLEMENTATION.md`
- **Rate Limit System:** `docs/CAMPAIGN_RATE_LIMIT_OPTIMIZATION.md`

---

## Rollback Instructions

If this fix causes issues, revert the changes:

```bash
cd /home/hashbuzz-social/Desktop/hashbuzz/dApp-backend
git diff src/shared/twitterAPI.ts
git checkout src/shared/twitterAPI.ts
npm run build
```

**Note:** Reverting will restore the 400 error. A different solution would be needed (e.g., using search API instead of quotes endpoint).

---

## Future Improvements

1. **Rate Limit Optimization:**
   - Add exponential backoff to retry logic
   - Check `x-rate-limit-remaining` header before retry
   - Implement queue-based rate limiting

2. **Monitoring:**
   - Add metrics for quote collection success/failure rates
   - Track API response times
   - Alert on repeated 400/429 errors

3. **Alternative Approach:**
   - Consider using Twitter search API with quote filtering
   - Evaluate if real-time quote tracking is feasible via webhooks
   - Implement quote caching for repeat queries

---

**Fix Status:** ✅ Complete
**Build Status:** ✅ Passing
**Ready for Production:** ⚠️ Pending campaign closing test
