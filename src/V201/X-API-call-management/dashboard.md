# Pool Status & Queue Depth Dashboard (Design)

## Features
- Visualize rate limit pool states (recent_search, liking_users)
- Show queue depth for each 15-minute window
- Display job states (pending, processing, completed, failed)
- Alert for high queue depth and post cap consumption
- Health and metrics summary

## Example Layout

| Endpoint        | Limit | Remaining | Reset Time         |
|----------------|-------|-----------|--------------------|
| recent_search  | 60    | 45        | 2025-10-08 12:15   |
| liking_users   | 25    | 20        | 2025-10-08 12:15   |

| Window Bucket   | Queue Depth |
|----------------|------------|
| 1696789200     | 12         |
| 1696790100     | 5          |

| Job State      | Count |
|---------------|-------|
| pending       | 8     |
| processing    | 3     |
| completed     | 20    |
| failed        | 1     |

## Alerts
- [ ] High queue depth (>50 jobs)
- [ ] Post cap consumption (>90%)

## Health & Metrics
- System health: OK
- Jobs processed: 1234
- Errors: 12
- Prometheus metrics available at `/metrics`
