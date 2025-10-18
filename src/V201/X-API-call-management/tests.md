# Test Plan

## Unit Tests
- WindowPoolManager: pool updates, Redis persistence
- PostCapManager: monthly/daily cap, overflow protection
- Campaign cost calculator: Quest/Awareness cost vectors

## Integration Tests
- API flows: submit campaign, get status, pools, quotas
- Mock X API: simulate rate limits, pagination, 429 errors

## Load Tests
- Concurrent campaign submissions
- Queue depth and throughput

## Constraint Enforcement
- Q + 3A ≤ 60, A ≤ 25 logic
- Pagination and post cap tracking
