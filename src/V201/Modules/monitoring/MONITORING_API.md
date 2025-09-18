# V201 Monitoring APIs

This document describes the monitoring endpoints available in the V201 API for system health and campaign monitoring.

## Authentication
All monitoring endpoints require admin authentication:
1. Valid admin token (`isAdminRequesting` middleware)
2. Super admin role (`isAdmin` middleware)

## Base URL
All endpoints are available under `/api/v201/monitoring`

## Health Check Endpoints

### GET /health/bullmq
Returns the health status of the BullMQ job queue system.

**Response:**
```json
{
  "status": "healthy",
  "details": {
    "isReady": true,
    "waiting": 0,
    "active": 1,
    "completed": 15,
    "failed": 0,
    "delayed": 0,
    "paused": 0
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### GET /health/system
Returns overall system health metrics.

**Response:**
```json
{
  "status": "healthy",
  "details": {
    "uptime": 86400,
    "memory": {
      "used": "512 MB",
      "total": "2 GB",
      "percentage": 25.6
    },
    "bullmq": {
      "isHealthy": true,
      "queues": ["campaign-close"]
    }
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Campaign Monitoring

### GET /campaigns/stuck
Identifies campaigns that are stuck in processing states and need manual intervention.

**Response:**
```json
{
  "status": "success",
  "data": {
    "stuckCampaigns": [
      {
        "id": "campaign-123",
        "status": "CLOSE_PENDING",
        "endTime": "2024-01-01T10:00:00.000Z",
        "stuckSince": "2024-01-01T10:30:00.000Z",
        "reason": "Job processing failed"
      }
    ],
    "count": 1
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### POST /campaigns/stuck/process
Attempts to reprocess stuck campaigns by requeuing their close jobs.

**Response:**
```json
{
  "status": "success",
  "data": {
    "processed": [
      {
        "campaignId": "campaign-123",
        "action": "requeued",
        "newJobId": "job-456"
      }
    ],
    "errors": []
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Token Monitoring

### GET /tokens/sync-status
Checks the synchronization status of supported tokens with external services.

**Response:**
```json
{
  "status": "success",
  "data": {
    "tokens": [
      {
        "symbol": "HBAR",
        "accountId": "0.0.123456",
        "lastSync": "2024-01-01T11:55:00.000Z",
        "syncStatus": "success",
        "balance": "1000.00"
      },
      {
        "symbol": "USDC",
        "accountId": "0.0.456789",
        "lastSync": "2024-01-01T11:50:00.000Z",
        "syncStatus": "warning",
        "balance": "500.00",
        "warning": "Sync delay detected"
      }
    ],
    "overallStatus": "warning"
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Status Codes

- **200 OK**: Request successful
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: Insufficient permissions (not super admin)
- **500 Internal Server Error**: Server error occurred

## Error Response Format

```json
{
  "status": "error",
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE"
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Usage Examples

### Using curl
```bash
# Get BullMQ health
curl -H "Authorization: Bearer <admin-token>" \
     http://localhost:3000/api/v201/monitoring/health/bullmq

# Process stuck campaigns
curl -X POST \
     -H "Authorization: Bearer <admin-token>" \
     http://localhost:3000/api/v201/monitoring/campaigns/stuck/process
```

### Using JavaScript/Axios
```javascript
const response = await axios.get('/api/v201/monitoring/health/system', {
  headers: {
    'Authorization': `Bearer ${adminToken}`
  }
});
console.log('System health:', response.data);
```

## Monitoring Best Practices

1. **Health Checks**: Monitor `/health/system` regularly for overall system health
2. **Queue Monitoring**: Check `/health/bullmq` to ensure job processing is working
3. **Campaign Issues**: Use `/campaigns/stuck` to identify and resolve campaign processing issues
4. **Token Sync**: Monitor `/tokens/sync-status` for token balance synchronization issues
5. **Alerting**: Set up alerts based on health status responses for proactive monitoring

## Integration Notes

- All endpoints are designed for integration with monitoring tools like Prometheus, Grafana, or custom dashboards
- Response times should be monitored as they indicate system performance
- Failed requests or error responses should trigger immediate alerts
- The monitoring system itself should be monitored to ensure reliability
