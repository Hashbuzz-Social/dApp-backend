# Monitoring Dashboard - Dead Letter Queue Display

**Date:** January 2025
**Version:** 0.201.23+
**Issue:** Dead letter queue counts not displayed in admin monitoring dashboard

---

## Problem

The admin monitoring dashboard was not showing **dead letter queue (DLQ) event counts**, making it difficult to identify events that failed and require manual review. The backend monitoring system had access to DLQ data from `EnhancedEventSystem`, but it wasn't being exposed through the monitoring API.

### Missing Information

- Dead letter event count (events moved to DLQ after retry failures)
- Event outbox pending count (events waiting to be processed)
- Visual indication when DLQ has events requiring attention

---

## Solution Implemented

### Backend Changes

#### 1. Updated `BullMQHealthStatus` Interface

**File:** `src/V201/Modules/monitoring/services/healthCheck.ts`

Added new fields to the health status interface:

```typescript
export interface BullMQHealthStatus {
  isConnected: boolean;
  queueName: string;
  // Legacy field names (backward compatibility)
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  // Frontend-compatible field names
  waitingJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  delayedJobs: number;
  // Event queue stats (from EnhancedEventSystem) ← NEW
  eventQueue?: {
    pending: number;
    completed: number;
    failed: number;
    deadLetter: number;  // ← DEAD LETTER COUNT
  };
  error?: string;
}
```

#### 2. Enhanced `checkBullMQHealth()` Method

**File:** `src/V201/Modules/monitoring/services/healthCheck.ts`

Now fetches event queue statistics including DLQ counts:

```typescript
async checkBullMQHealth(): Promise<BullMQHealthStatus> {
  try {
    // ... existing BullMQ queue checks

    // Get event queue stats from EnhancedEventSystem
    const { EnhancedEventSystem } = await import('../../../enhancedEventSystem');
    const eventStats = await EnhancedEventSystem.getEventStats();

    return {
      isConnected: true,
      queueName: CampaignScheduledEvents.CAMPAIGN_CLOSE_OPERATION,
      // ... job counts
      eventQueue: eventStats,  // ← Include dead letter stats
    };
  } catch (error) {
    // ... error handling
  }
}
```

**Data Source:** `EnhancedEventSystem.getEventStats()` queries the `eventOutBox` table:
- **Pending:** Events not prefixed with `DEAD_LETTER_`
- **Dead Letter:** Events with `event_type` starting with `DEAD_LETTER_`

### Frontend Changes

#### 1. Updated API Types

**File:** `frontend/src/API/monitoring.ts`

Added `eventQueue` to the BullMQ health response:

```typescript
interface BullMQHealthResponse {
  success: boolean;
  data: {
    isConnected: boolean;
    activeJobs: number;
    waitingJobs: number;
    completedJobs: number;
    failedJobs: number;
    delayedJobs?: number;
    eventQueue?: {           // ← NEW
      pending: number;
      completed: number;
      failed: number;
      deadLetter: number;    // ← DEAD LETTER COUNT
    };
  };
  timestamp: string;
}
```

#### 2. Enhanced Dashboard Display

**File:** `frontend/src/Ver2Designs/Pages/Dashboard/DashboardAdmin/AdminView/AdminMonitoringView.tsx`

**Added Dead Letter Queue Metric Card:**

```tsx
<Box sx={{ flex: '1 1 250px', minWidth: '250px' }}>
  <Card>
    <CardContent>
      <Typography variant='h6' gutterBottom>
        Dead Letter Queue
      </Typography>
      <Typography
        variant='h3'
        color={(eventQueueStats?.deadLetter || 0) > 0 ? 'error.main' : 'text.secondary'}
      >
        {eventQueueStats?.deadLetter || 0}
      </Typography>
      <Typography variant='body2' color='text.secondary'>
        Manual review required
      </Typography>
    </CardContent>
  </Card>
</Box>
```

**Updated Event Queue Statistics Card:**

Now shows 4 metrics instead of 2:
- **Processing** - Active jobs (blue)
- **Completed** - Finished jobs (green)
- **Event Pending** - Events in outbox waiting (yellow)
- **Dead Letter** - Failed events in DLQ (red if > 0)

```tsx
<Box display='flex' gap={2}>
  <Box sx={{ flex: 1 }}>
    <Typography variant='body2' color='text.secondary'>
      Event Pending
    </Typography>
    <Typography variant='h4' color='warning.main'>
      {eventQueueStats.eventPending}
    </Typography>
  </Box>
  <Box sx={{ flex: 1 }}>
    <Typography variant='body2' color='text.secondary'>
      Dead Letter
    </Typography>
    <Typography
      variant='h4'
      color={eventQueueStats.deadLetter > 0 ? 'error.main' : 'text.secondary'}
    >
      {eventQueueStats.deadLetter}
    </Typography>
  </Box>
</Box>
```

---

## Visual Changes

### Before
- 4 metric cards: System Status, Active Campaigns, Event Queue, Failed Events
- Event Queue Statistics showed only: Processing, Completed
- No dead letter visibility

### After
- 5 metric cards: System Status, Active Campaigns, Event Queue, Failed Events, **Dead Letter Queue**
- Event Queue Statistics shows: Processing, Completed, **Event Pending**, **Dead Letter**
- Dead letter count highlighted in **red** when > 0

---

## What is Dead Letter Queue?

### Definition
The Dead Letter Queue (DLQ) contains events that:
1. Failed all retry attempts
2. Are configured with **no retry** (Twitter rate limits, smart contract errors)
3. Require manual investigation and reprocessing

### Event Types in DLQ

Events are prefixed with `DEAD_LETTER_` in the `eventOutBox` table:

| Original Event | Dead Letter Event |
|---------------|-------------------|
| `CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_LIKE_AND_RETWEET` | `DEAD_LETTER_CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_LIKE_AND_RETWEET` |
| `CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY` | `DEAD_LETTER_CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY` |

### Why Events Go to DLQ

1. **Twitter Rate Limits (429)** - Automatic retry would cause more rate limit hits
2. **Smart Contract Errors** - Blockchain errors that won't resolve with retry
3. **Max Retry Exceeded** - Event failed 3 times (default retry limit)
4. **No Retry Events** - Configured to skip retry (see `isNoRetryEvent()`)

### How to Handle DLQ Events

**Manual Review Required:**
1. Check DLQ count in monitoring dashboard
2. Investigate event details in `eventOutBox` table:
   ```sql
   SELECT * FROM eventOutBox
   WHERE event_type LIKE 'DEAD_LETTER_%'
   ORDER BY created_at DESC;
   ```
3. Fix root cause (e.g., wait for rate limit reset, fix contract issue)
4. Reprocess manually via API or `EnhancedEventSystem.reprocessDeadLetterEvents()`

---

## API Response Example

### GET `/api/v201/monitoring/health/bullmq`

```json
{
  "success": true,
  "data": {
    "isConnected": true,
    "queueName": "CAMPAIGN_CLOSE_OPERATION",
    "waiting": 2,
    "active": 1,
    "completed": 150,
    "failed": 3,
    "delayed": 0,
    "paused": false,
    "waitingJobs": 2,
    "activeJobs": 1,
    "completedJobs": 150,
    "failedJobs": 3,
    "delayedJobs": 0,
    "eventQueue": {
      "pending": 5,
      "completed": 0,
      "failed": 0,
      "deadLetter": 2  // ← DEAD LETTER COUNT
    }
  },
  "timestamp": "2025-01-19T17:57:00.000Z"
}
```

---

## Testing

### Manual Testing

1. **Start Backend:**
   ```bash
   cd /home/hashbuzz-social/Desktop/hashbuzz/dApp-backend
   npm run dev
   ```

2. **Check API Directly:**
   ```bash
   curl http://localhost:4000/api/v201/monitoring/health/bullmq
   ```

3. **View Dashboard:**
   - Navigate to Admin Dashboard → Monitoring tab
   - Check "Dead Letter Queue" card displays count
   - Check "Event Queue Statistics" shows all 4 metrics

### Verify Dead Letter Detection

1. **Create a dead letter event** (for testing):
   ```sql
   INSERT INTO eventOutBox (event_type, event_data, created_at)
   VALUES ('DEAD_LETTER_TEST_EVENT', '{}', NOW());
   ```

2. **Check dashboard:**
   - Dead Letter Queue card should show count = 1
   - Number should be **red** (error.main color)

3. **Clean up:**
   ```sql
   DELETE FROM eventOutBox WHERE event_type = 'DEAD_LETTER_TEST_EVENT';
   ```

---

## Monitoring Best Practices

### Daily Checks
- ✅ Dead Letter Queue count should be **0** or very low (< 5)
- ✅ Event Pending should decrease over time (not growing indefinitely)
- ✅ Failed Events should be investigated within 24 hours

### Alert Thresholds
- **Warning:** Dead Letter > 5 events
- **Critical:** Dead Letter > 20 events
- **Critical:** Event Pending > 100 (indicates processing slowdown)

### Investigation Steps

If Dead Letter Queue shows events:

1. **Check Event Details:**
   ```sql
   SELECT event_type, event_data, created_at, error_message
   FROM eventOutBox
   WHERE event_type LIKE 'DEAD_LETTER_%'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

2. **Identify Pattern:**
   - Same event type failing repeatedly? → Check handler code
   - Twitter-related events? → Check rate limits, credentials
   - Contract-related events? → Check Hedera network status

3. **Fix Root Cause:**
   - Wait for rate limit reset (15 min window)
   - Fix contract parameters
   - Update user credentials
   - Fix code bug in event handler

4. **Reprocess Events:**
   ```typescript
   // Via EventsWorker (logs show reprocess count)
   // OR manually via API endpoint (if implemented)
   ```

---

## Related Files

### Backend
- ✅ `src/V201/Modules/monitoring/services/healthCheck.ts` - Added eventQueue stats
- ✅ `src/V201/Modules/monitoring/controllers/MonitoringController.ts` - Returns enhanced data
- ✅ `src/V201/enhancedEventSystem.ts` - Provides `getEventStats()` method

### Frontend
- ✅ `src/API/monitoring.ts` - Updated TypeScript interfaces
- ✅ `src/Ver2Designs/Pages/Dashboard/DashboardAdmin/AdminView/AdminMonitoringView.tsx` - Added DLQ display

### Documentation
- `docs/CAMPAIGN_PUBLISHING_ARCHITECTURE.md` - Event system architecture
- `docs/TWITTER_QUOTES_ENDPOINT_FIX.md` - Events moved to DLQ (no retry)
- `docs/ENGAGEMENT_COLLECTION_OPTIONS.md` - Collection configuration

---

## Future Enhancements

1. **DLQ Management UI:**
   - View dead letter events in dashboard
   - Reprocess button for individual events
   - Bulk reprocess with filters

2. **Alerting:**
   - Email/Slack notification when DLQ > threshold
   - Daily summary of DLQ status

3. **Analytics:**
   - Dead letter trends over time
   - Most common failure reasons
   - Success rate after reprocessing

4. **Auto-Recovery:**
   - Smart reprocessing based on error type
   - Exponential backoff for rate limits
   - Automatic cleanup of old dead letter events

---

**Status:** ✅ Complete
**Build:** ✅ Backend Passing
**TypeScript:** ✅ No Errors
**UI:** ✅ Dead Letter Queue Displayed
**Ready for Production:** ✅ Yes
