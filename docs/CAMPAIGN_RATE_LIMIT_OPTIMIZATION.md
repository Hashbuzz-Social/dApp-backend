# CAMPAIGN_RATE_LIMIT_OPTIMIZATION.md

## Scope

You run two promo types on X (Basic tier):

* **Quest promo**: runs 15 minutes; you must fetch user IDs and comment content for replies and quotes right after it ends.
* **Awareness promo**: runs 60 minutes; you must fetch user IDs for people who liked, reposted, replied, or quoted the promo right after it ends.

This doc gives hard limits, safe concurrency math, and a simple self-throttling plan. All numbers and operators are from X’s official docs. Citations are at each claim.

---

## Source of truth

* **Basic plan Post cap**: 15,000 Posts/month at the Project level; applies to endpoints that *return Posts*, including Recent Search and Filtered Stream. Liking Users is not listed among capped endpoints. ([X Developer Platform][1])
* **Recent Search rate limit (Basic)**: 60 requests per 15 minutes per app. ([X Developer Platform][2])
* **Liking Users endpoint**: returns the users who liked a Post. It is hard-capped to **100 total liking accounts per Post for all time**; requests are paginated (`max_results` up to 100). Basic tier rate limit: **25 requests/15 minutes per app**. ([X Developer Platform][3])
* **Quoted Posts endpoint** (`/quote_tweets`): paginated, default 10 per page, `max_results` up to 100; Basic limit **5 requests/15 minutes per app**. ([X Developer Platform][4])
* **Reposted by endpoint** (`/retweeted_by`): paginated, `max_results` up to 100; Basic limit **5 requests/15 minutes per app**. ([X Developer Platform][5])
* **Recent Search page size**: up to 100 posts per request with pagination. ([X Developer Platform][6])
* **Search operators you can and should use** to avoid low-limit “by-ID” fan-out endpoints:

  * Replies to a Post: `in_reply_to_tweet_id:<POST_ID>`
  * Quotes of a Post: `quotes_of_tweet_id:<POST_ID>`
  * Reposts of a Post: `retweets_of_tweet_id:<POST_ID>`
  * Thread root scoping: `conversation_id:<ROOT_ID>`
    These are documented operators. ([X Developer Platform][7])

**Why lean on Recent Search?** The dedicated quote/repost list endpoints are 5 req/15m on Basic and will choke under concurrency. Recent Search is 60 req/15m and returns full Post objects so you also get the text you need for comment content. ([X Developer Platform][2])

---

## What each promo actually calls

To stay within Basic tier limits and still collect the right data:

### Quest promo (15 min)

* **Replies content**: `GET /2/tweets/search/recent?q=in_reply_to_tweet_id:<ID>&max_results=100` (paginate if needed).
* **Quotes content**: `GET /2/tweets/search/recent?q=quotes_of_tweet_id:<ID>&max_results=100` (paginate if needed).
* **Calls per campaign at minimum**: **2 Recent Search calls** (one for replies, one for quotes). Each returns up to 100 Posts/page. ([X Developer Platform][7])

### Awareness promo (60 min)

* **Replies content**: Recent Search as above.
* **Quotes content**: Recent Search as above.
* **Reposts**: Recent Search with `retweets_of_tweet_id:<ID>`.
* **Likes (user IDs)**: `GET /2/tweets/{id}/liking_users?max_results=100` (capped to 100 unique likers per Post lifetime).
* **Calls per campaign at minimum**: **3 Recent Search calls + 1 Liking Users call**. ([X Developer Platform][7])

---

## Hard limits that govern throughput

* **Recent Search**: 60 requests per 15 minutes per app (Basic). ([X Developer Platform][2])
* **Liking Users**: 25 requests per 15 minutes per app (Basic). Also hard cap: at most 100 liking users exist to return for a Post. ([X Developer Platform][2])
* **Monthly Post cap** (Project): 15,000 Posts counted across endpoints that *return Posts*, including Recent Search. Liking Users responses return Users and do not appear on the capped list. ([X Developer Platform][1])

---

## Concurrency math (per 15-minute window)

Let:

* `Q` = number of Quest campaigns that *finish* in the same 15-minute window.
* `A` = number of Awareness campaigns that *finish* in the same 15-minute window.

Minimum call budget per finished campaign:

* Quest: **2** Recent Search calls.
* Awareness: **3** Recent Search calls **+ 1** Liking Users call.

**Constraints:**

* Recent Search: `2·Q + 3·A ≤ 60`  (Basic tier app limit). ([X Developer Platform][2])
* Liking Users: `A ≤ 25`  (Basic tier app limit). ([X Developer Platform][2])

**Max same-window finishes (single-type runs):**

* **Quest-only**: `2·Q ≤ 60` ⇒ **Q_max = 30** campaigns per 15 min.
* **Awareness-only**: `3·A ≤ 60` and `A ≤ 25` ⇒ **A_max = 20** campaigns per 15 min (Recent Search is the tighter bound).

**Per-day theoretical ceilings from rate limits (96 windows/day):**

* **Quest**: `30 × 96 = 2,880` campaigns/day.
* **Awareness**: `20 × 96 = 1,920` campaigns/day.
  These ceilings assume each query fits in a single page and you do not hit the monthly Post cap. The moment pagination kicks in, both request counts and Post-cap consumption increase. ([X Developer Platform][6])

**Mixed example:** `Q = 15` and `A = 10` ⇒ Recent Search calls = `2·15 + 3·10 = 60` (window full) and Liking Users calls = `10` (≤ 25). Valid.

---

## Monthly Post-cap budgeting (the silent killer)

Post cap counts **Posts returned**, not requests. Recent Search returns up to 100 Posts per page. If you request more pages, you consume more cap. ([X Developer Platform][1])

Define average per-campaign page counts for Quest:

* `P_r` = pages for replies; `P_q` = pages for quotes (each page is up to 100 Posts).

**Quest Post-cap usage/campaign** ≈ `100·P_r + 100·P_q`.
If most promos fit on one page per type: ~200 Posts/campaign.

Define Awareness:

* `P_rt` = pages for reposts; `P_r`, `P_q` as above.

**Awareness Post-cap usage/campaign** ≈ `100·(P_r + P_q + P_rt)`.
Likes do not consume Post cap. ([X Developer Platform][1])

**Back-of-envelope daily safety** (30-day month; average one page per type):

* **Quest**: 15,000 / 200 ≈ **75** campaigns/day.
* **Awareness**: 15,000 / 300 ≈ **50** campaigns/day.

These are **cap-safe** planning numbers. If a promo explodes beyond 100 replies/quotes/reposts, your cap burn rises linearly with pages.

---

## Scheduler: self-throttling recipe

**Use only Recent Search for replies/quotes/reposts** to stay in the 60/15m budget. Avoid `/quote_tweets` and `/retweeted_by` on Basic unless absolutely required; they are 5/15m and will bottleneck. ([X Developer Platform][2])

### Core rules

1. **Evenly stagger promo end times** so that the number of promos *ending* in any 15-minute bin satisfies:
   `2·Q + 3·A ≤ 60` and `A ≤ 25`. Track these counters centrally.
2. **Always request with `max_results=100`** and **paginate only as needed** using `next_token`. Back-off as soon as `x-rate-limit-remaining` drops. ([X Developer Platform][6])
3. **Respect the Liking Users realities**:

   * It returns at most 100 total likers per Post lifetime. One page usually suffices. ([X Developer Platform][3])
   * You still must respect its **25/15m** app limit when many Awareness promos end together. ([X Developer Platform][2])
4. **Cap guardrail**: set a daily cap budget (e.g., 500 Posts/day ≈ 15k/30). If a bin’s estimated pages would exceed the remaining daily budget, defer low-priority promos to the next bin. ([X Developer Platform][1])
5. **Monitor headers** on every call and adapt:

   * `x-rate-limit-limit`, `x-rate-limit-remaining`, `x-rate-limit-reset`. ([X Developer Platform][2])

### Pseudocode

```ts
// called when a promo ends
function enqueueHarvest(job) {
  // job.type ∈ {Quest, Awareness}
  queue.push(job)
  drain()
}

function drain() {
  const windowKey = floorTo15m(now())
  let recentBudget = 60 - used.recent[windowKey]
  let likeBudget   = 25 - used.likes[windowKey]

  // pull jobs in priority order without violating budgets
  for (job of queue) {
    const recentNeed = (job.type === 'Quest') ? 2 : 3
    const likeNeed   = (job.type === 'Quest') ? 0 : 1

    if (recentNeed <= recentBudget && likeNeed <= likeBudget) {
      // schedule calls with jitter and retry/backoff
      scheduleRecentSearch(job, 'replies')
      scheduleRecentSearch(job, 'quotes')
      if (job.type === 'Awareness') {
        scheduleRecentSearch(job, 'reposts')
        scheduleLikingUsers(job)
        likeBudget   -= 1
      }
      recentBudget -= recentNeed
      markStarted(job)
      removeFromQueue(job)
    }
  }
}
```

Add exponential backoff on 429 using `x-rate-limit-reset`. ([X Developer Platform][2])

---

## Query templates (drop-in)

Use one query per type; add `start_time`/`end_time` if you want to restrict to the promo window.

```
# Replies
in_reply_to_tweet_id:POST_ID

# Quotes
quotes_of_tweet_id:POST_ID

# Reposts
retweets_of_tweet_id:POST_ID
```

Use `max_results=100` and page with `next_token` until `result_count < 100`. Operators are documented. ([X Developer Platform][7])

---

## Flowchart

```mermaid
flowchart TD
  A[Promo ends] --> B{Type}
  B -->|Quest| C[Collect via Recent Search:\nreplies + quotes]
  B -->|Awareness| D[Collect via Recent Search:\nreplies + quotes + reposts]
  D --> E[Collect Likes via\nGET /liking_users]
  C --> F[Compute required calls]
  E --> F
  F --> G{Fits window budgets?\n2·Q + 3·A ≤ 60 and A ≤ 25}
  G -->|Yes| H[Execute with jitter\nand pagination]
  G -->|No| I[Defer to next 15-min window]
  H --> J[Write results\n& decrement Post-cap budget]
  I --> K[Re-evaluate on reset\n(x-rate-limit headers)]
```

---

## Reality check vs the original draft

* The prior “180 requests/15m engagement endpoints” pool does **not** exist on Basic. Each endpoint has its own limit, and Recent Search is 60/15m per app. ([X Developer Platform][2])
* Dedicated Quote/Repost list endpoints are **5/15m per app** on Basic; do not plan concurrency around them. Use Recent Search operators instead. ([X Developer Platform][2])
* Likes have a **100-liker lifetime cap** per Post; plan for a single page and do not build logic expecting >100 likers from the API. ([X Developer Platform][3])
* You must budget for the **15,000 Posts/month** Project cap; otherwise your theoretical per-day counts collapse in practice. ([X Developer Platform][1])

---

## Practical planning numbers

Assuming typical promos fit in one page per engagement type:

* **Quest**: cap-safe ≈ **≤ 75 per day** (to stay under the monthly Post cap); hard rate-limit ceiling **2,880/day** if you ignore cap. ([X Developer Platform][1])
* **Awareness**: cap-safe ≈ **≤ 50 per day**; hard rate-limit ceiling **1,920/day** if you ignore cap. ([X Developer Platform][1])

Tune these based on observed average pages per type.

---

## Implementation checklist

* [ ] Use Recent Search for replies/quotes/reposts; set `max_results=100`; paginate. ([X Developer Platform][6])
* [ ] Use `GET /2/tweets/{id}/liking_users` for likes; expect ≤100 total likers. ([X Developer Platform][3])
* [ ] Enforce `2·Q + 3·A ≤ 60` and `A ≤ 25` per 15-minute window. ([X Developer Platform][2])
* [ ] Read and act on `x-rate-limit-*` headers, exponential backoff on 429. ([X Developer Platform][2])
* [ ] Track monthly **Post cap** usage; cut off or defer when approaching 15,000. ([X Developer Platform][1])

---

### Notes and uncertainty

* X’s docs have legacy pages that still reference older caps (10,000/month). Prefer the **Post cap** page that lists **15,000** for Basic and enumerates capped endpoints. ([X Developer Platform][1])
* Real-world throughput depends on pagination. If a promo goes viral, page count grows and both requests and cap consumption spike.


[1]: https://docs.x.com/x-api/fundamentals/post-cap "Post cap - X"
[2]: https://docs.x.com/x-api/fundamentals/rate-limits "Rate limits - X"
[3]: https://docs.x.com/x-api/posts/likes/introduction "Introduction - X"
[4]: https://docs.x.com/x-api/posts/get-quoted-posts?utm_source=chatgpt.com "Get Quoted Posts"
[5]: https://docs.x.com/x-api/posts/get-reposted-by?utm_source=chatgpt.com "Get Reposted by"
[6]: https://docs.x.com/x-api/posts/search/introduction?utm_source=chatgpt.com "Introduction - X"
[7]: https://docs.x.com/x-api/posts/search/integrate/build-a-query?utm_source=chatgpt.com "Build a query"
