# System-Level Rate Limit Management for X API Campaigns

## Overview
This document presents a system-level architecture for managing X API Basic rate limits when multiple users create Quest and Reward campaigns. It includes a mermaid flowchart with notes and logic for dynamic allocation, tracking, and enforcement.

---

## Key Concepts
- **Global API Call Pool**: Shared quota (180 calls/15min) for all users/campaigns
- **Dynamic Allocation**: As users create campaigns, available slots for each type adjust in real time
- **Campaign Types**:
  - Quest: 2 calls/campaign (reply, quote)
  - Reward: 4 calls/campaign (like, retweet, reply, quote)
- **Scheduler/Manager**: Tracks active campaigns, allocates API calls, queues jobs, and enforces limits

---

## System Flowchart

```mermaid
flowchart TD
    A[Start: User Requests Campaign] --> B{Campaign Type}
    B -->|Quest| C[Reserve 2 API Calls]
    B -->|Reward| D[Reserve 4 API Calls]
    C --> E[Update Global API Pool]
    D --> E
    E --> F{API Pool Sufficient?}
    F -->|Yes| G[Publish Tweet]
    F -->|No| H[Queue Campaign]
    G --> I[Track Campaign]
    H --> I
    I --> J[Schedule Engagement Fetch]
    J --> K[Fetch Engagements]
    K --> L[Release API Calls]
    L --> M[Update Pool & Logs]
    M --> N{New Campaign Request?}
    N -->|Yes| B
    N -->|No| O[End]

    %% Notes on each step
    classDef note fill:#f9f,stroke:#333,stroke-width:1px;
    class A,B,C,D,E,F,G,H,I,J,K,L,M,N,O note;
    %%
    %% A: User requests a new campaign (Quest or Reward)
    %% B: System checks campaign type
    %% C/D: Reserves required API calls from global pool
    %% E: Updates the global API pool (decrements available calls)
    %% F: Checks if enough API calls remain for immediate publishing
    %% G: If yes, publishes tweet and starts campaign
    %% H: If no, queues campaign for next available window
    %% I: Tracks campaign in active list
    %% J: Schedules engagement fetch at campaign end
    %% K: Fetches engagement data using reserved API calls
    %% L: Releases API calls back to pool after fetch
    %% M: Updates pool and logs campaign completion
    %% N: Checks for new campaign requests (loop)
    %% O: Ends process if no new requests
```

---

## Dynamic Calculation Logic

- **Global API Pool**: 180 calls/15min
- **On Each New Campaign Request**:
  - If Quest: decrement pool by 2
  - If Reward: decrement pool by 4
  - If pool < required, queue campaign
- **Real-Time Adjustment**:
  - As campaigns complete and calls are released, queued campaigns are published
  - If users create only Quest campaigns, max possible Reward campaigns decreases (and vice versa)
- **Example**:
  - If 80 Quest campaigns (80×2=160 calls) are active, only 5 Reward campaigns (5×4=20 calls) can be started in same window (160+20=180)
  - If 45 Reward campaigns (45×4=180 calls) are active, no Quest campaigns can be started until pool resets

---

## Notes on Flowchart Steps
- **A**: Entry point for campaign creation requests
- **B**: System checks type to determine API call cost
- **C/D**: Reserves API calls from global pool
- **E**: Updates pool, tracks available calls
- **F**: If pool sufficient, campaign is published; else, queued
- **G/H**: Campaign is either started or queued for next window
- **I**: Active campaigns tracked for engagement fetch scheduling
- **J**: Engagement fetch scheduled at campaign end
- **K**: Engagement data fetched using reserved calls
- **L**: API calls released back to pool
- **M**: Pool and logs updated; system ready for next request
- **N**: Loop for continuous campaign creation
- **O**: End of process

---

## Recommendations
- **Implement global API pool manager** (Redis or in-memory)
- **Enforce dynamic allocation and queuing**
- **Log pool state and campaign actions for audit**
- **Monitor rate limit headers and auto-adjust pool**
- **Provide user feedback if campaign is queued due to limits**

---

## References
- [X API Rate Limits](https://docs.x.com/x-api/fundamentals/rate-limits)
