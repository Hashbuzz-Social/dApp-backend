# CAMPAIGN_RATE_LIMIT_SYSTEM_DESIGN.md

## Scope

We run two promo types on X (Basic tier):

* **Quest**: 15 minutes. At end, fetch user IDs and comment content for replies and quotes.
* **Awareness**: 60 minutes. At end, fetch user IDs for likes, reposts, replies, and quotes.

Assume OAuth 2.0 Bearer Token (app-only). Rate limits are per endpoint, per app, over 15-minute windows. Recent Search returns up to 100 posts per request and paginates. Returned posts count against the monthly Post cap at the Project level. Basic allows one Project and up to two Apps per Project. ([docs.x.com][1])

## Correct limits to design against (Basic)

* **Recent Search** `/2/tweets/search/recent`: **60 requests / 15 min per app**. ([docs.x.com][1])
* **Get Liking Users** `/2/tweets/:id/liking_users`: **25 requests / 15 min per app**. Also a **hard cap of 100 liking accounts per post for all time**. ([docs.x.com][1])
* **Get Quoted Posts** `/2/tweets/:id/quote_tweets`: **5 requests / 15 min per app**. ([docs.x.com][1])
* **Get Retweeted By** `/2/tweets/:id/retweeted_by`: **5 requests / 15 min per app**. ([docs.x.com][1])
* **Monthly Post cap** (Project): **15,000 posts / month**. Posts from Recent Search and other listed endpoints count toward this cap. ([docs.x.com][2])
* **Rate-limit headers**: read `x-rate-limit-limit`, `x-rate-limit-remaining`, `x-rate-limit-reset` and adapt. ([docs.x.com][3])

## Design principles

1. **Do not use a single “global 180 calls” pool.** X Basic has **endpoint-specific** limits that differ by endpoint. Build separate pools. ([docs.x.com][1])
2. **Prefer Recent Search** for replies, quotes, and reposts to avoid the stricter 5/15m caps on the quote/repost list endpoints. Use operators such as `in_reply_to_tweet_id:`, `quotes_of_tweet_id:`, and `retweets_of_tweet_id:`. Each request returns up to 100 posts and paginates with `next_token`. ([docs.x.com][4])
3. **Track the monthly Post cap** alongside per-endpoint windows. The cap is at the **Project** level and will apply to both Apps in the Project. ([docs.x.com][2])

## Cost model per campaign (minimum calls)

Treat each campaign that **finishes** in a 15-minute window as consuming:

* **Quest**:

  * 1 Recent Search call for replies
  * **Total**: **1 Recent Search** calls (≥1 if pagination) ([docs.x.com][4])

* **Awareness**:

  * 1 Recent Search call for replies
  * 1 Recent Search call for quotes
  * 1 Recent Search call for reposts
  * 1 Liking Users call for likes (max one page because of the 100-liker cap)
  * **Total**: **3 Recent Search + 1 Liking Users** (≥3 Recent Search if pagination) ([docs.x.com][4])

## Window constraints (per app)

Let `Q` = Quest finishes in a window. Let `A` = Awareness finishes in a window.

* **Recent Search budget**: `1·Q + 3·A ≤ 60`. ([docs.x.com][1])
* **Liking Users budget**: `A ≤ 25`. ([docs.x.com][1])

If you **choose** to call the list endpoints instead of Recent Search:

* **Quote list** budget: adds `A ≤ 5`. ([docs.x.com][1])
* **Repost list** budget: adds `A ≤ 5`. ([docs.x.com][1])

This is why the design uses Recent Search for quotes and reposts.

## Post-cap budgeting

Returned posts count against the monthly cap. One Recent Search page can return up to 100 posts. Multiple pages consume more cap. Deduplication is daily, not per request. Track an estimated **posts-returned** counter and stop or defer before the 15,000 limit. ([docs.x.com][5])

## System architecture

### Components

* **Rate Limit Manager**

  * Pools: `recent_search`, `liking_users`.
  * Each pool tracks: window size, remaining, reset time. Pull values from headers on every call. ([docs.x.com][3])
* **Cap Manager**

  * Tracks monthly post consumption. Budget against **15,000 posts**. ([docs.x.com][2])
* **Scheduler**

  * Converts each finishing campaign into a **cost vector**:

    * Quest → `{ recent: 1, likes: 0 }`
    * Awareness → `{ recent: 3, likes: 1 }`
  * Admits jobs iff all pools and the cap budget can satisfy the vector.
  * Queues jobs that do not fit.
* **Store**

  * Redis or SQL table for windows, queues, and cap counters.

### Admission logic (per app)

1. On campaign finish, compute cost vector.
2. Peek pool remaining:

   * `recent_remaining ≥ (1 or 3)` and `likes_remaining ≥ (0 or 1)`.
3. Check **cap_remaining ≥ projected_posts** for the job.
4. If all pass, schedule calls with jitter; else queue until reset.

### Pseudocode

```ts
type Pools = { recent: WindowPool; likes: WindowPool }
type Cost = { recent: number; likes: number }

function costOf(type: 'Quest'|'Awareness'): Cost {
  return type === 'Quest' ? { recent: 1, likes: 0 } : { recent: 3, likes: 1 }
}

function tryAdmit(job, pools: Pools, capRemaining: number): boolean {
  const c = costOf(job.type)
  const postsEstimate = job.type === 'Quest' ? 200 : 300 // 2–3 pages x 100 if typical
  if (pools.recent.remaining < c.recent) return false
  if (pools.likes.remaining  < c.likes)  return false
  if (capRemaining < postsEstimate)       return false
  reserve(pools, c); reserveCap(postsEstimate)
  dispatch(job) // schedule API calls with jitter + pagination until exhausted
  return true
}
```

* Use exponential backoff on 429 and resume at `x-rate-limit-reset`. ([docs.x.com][3])

## Flowchart

```mermaid
flowchart TD
  A[Promo ends] --> B{Type}
  B -->|Quest| C[Cost = {recent:1, likes:0}]
  B -->|Awareness| D[Cost = {recent:3, likes:1}]
  C --> E[Check pools:\nrecent ≥ need\nlikes ≥ need]
  D --> E
  E --> F[Check Post-cap budget]
  F --> G{All constraints OK?}
  G -->|Yes| H[Schedule API calls\nwith jitter + paging]
  G -->|No| I[Queue until pool reset\nor cap available]
  H --> J[Update pool from headers\nUpdate cap by posts returned]
  I --> K[Wake on reset or cap gain]
  J --> L[Done]
  K --> E
```

## Multi-tenant fairness

* Use a **per-tenant credit bucket** over the same 15-minute window.
* Admit jobs round-robin across tenants while respecting global pools.
* Optionally, set per-tenant daily Post-cap slices so one tenant cannot exhaust the 15,000-post budget. ([docs.x.com][2])

## Two-app scaling (same Project)

* Basic allows **two Apps per Project**. App-level rate limits apply per App, so you can split traffic across Apps to increase **request** throughput. The **Post cap** remains shared at the Project level. ([docs.x.com][6])

## Concrete numbers you can enforce now (per app)

* **Quest finishes per window**: `1·Q + 3·A ≤ 60` and `A ≤ 25`. With Quest-only, `Q ≤ 60`. With Awareness-only, `A ≤ 20` (Recent Search is binding). ([docs.x.com][1])
* **Avoid** calling `/quote_tweets` and `/retweeted_by` in bulk on Basic. They are **5 requests / 15 min per app** and will bottleneck. Use Recent Search operators instead. ([docs.x.com][1])
* **Likes**: one page per post in practice due to the **100-liker lifetime cap**. Still respect the **25 / 15 min per app** window when many Awareness promos end together. ([docs.x.com][7])

## Operational checklist

* Read and act on `x-rate-limit-*` headers on every call. Back off on 429 until reset. ([docs.x.com][3])
* Send Recent Search with `max_results=100`; paginate with `next_token` only when needed. Each page increases Post-cap usage. ([docs.x.com][5])
* Track daily and monthly Post-cap consumption; cut off or defer as you approach **15,000**. ([docs.x.com][2])
* Keep per-endpoint pools in Redis with TTLs aligned to reset times.

## What changed vs the original draft

* Removed the **“Global API Call Pool: 180/15m”** concept. Limits are **per endpoint** and much lower for quote/repost lists. ([docs.x.com][1])
* Replaced “Reward = 4 calls” with a **cost vector** that matches documented limits: **3 Recent Search + 1 Liking Users**. ([docs.x.com][1])
* Added the **100-liker lifetime cap**. ([docs.x.com][7])
* Added the **15,000 posts/month** cap and **two-app** note. ([docs.x.com][2])

### Uncertainty

* If you switch auth to **user context**, per-user limits also apply; the table shows separate per-user columns. This design assumes **app-only**. Validate in headers at runtime. ([docs.x.com][1])

[1]: https://docs.x.com/x-api/fundamentals/rate-limits "Rate limits - X"
[2]: https://docs.x.com/x-api/fundamentals/post-cap?utm_source=chatgpt.com "Post cap"
[3]: https://docs.x.com/x-api/fundamentals/response-codes-and-errors?utm_source=chatgpt.com "Response codes and errors - X"
[4]: https://docs.x.com/x-api/posts/recent-search?utm_source=chatgpt.com "Search recent Posts"
[5]: https://docs.x.com/x-api/posts/search/introduction?utm_source=chatgpt.com "Introduction"
[6]: https://docs.x.com/x-api/getting-started/about-x-api "About the X API - X"
[7]: https://docs.x.com/x-api/posts/likes/introduction?utm_source=chatgpt.com "Introduction"
