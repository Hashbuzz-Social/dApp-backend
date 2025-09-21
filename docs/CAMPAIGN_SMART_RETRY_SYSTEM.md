# Campaign Smart Retry System Documentation

## Overview

The Campaign Smart Retry System is designed to handle partial failures in the campaign publishing process and provide intelligent retry mechanisms. When users attempt to publish a campaign that has previously failed at any step, the system detects the current state and resumes from where it left off instead of starting over.

## Problem Solved

### Previous Issues:
1. **Smart Contract Failure After First Tweet**: If the smart contract transaction failed after the first tweet was posted, re-attempting to publish would try to post the first tweet again, causing duplicates or errors.

2. **Second Tweet Failure**: If the second tweet publication failed after the smart contract succeeded, re-attempting would restart the entire flow, potentially creating inconsistent state.

3. **No State Visibility**: Users had no way to know what step failed or what action was needed to fix their campaign.

### New Solution:
- **State Detection**: Automatically detects what step the campaign failed at
- **Smart Resume**: Continues from the exact point of failure
- **Clear Error Messages**: Provides detailed information about campaign state and required actions
- **Diagnostic Endpoint**: Allows checking campaign state without triggering actions

## System Components

### 1. Campaign State Validator (`campaignStateValidator.ts`)

Analyzes campaign data to determine current publish state:

```typescript
enum CampaignPublishState {
  NOT_STARTED = 'NOT_STARTED',
  FIRST_TWEET_PUBLISHED = 'FIRST_TWEET_PUBLISHED',
  SMART_CONTRACT_FAILED = 'SMART_CONTRACT_FAILED',
  SMART_CONTRACT_COMPLETED = 'SMART_CONTRACT_COMPLETED',
  SECOND_TWEET_FAILED = 'SECOND_TWEET_FAILED',
  FULLY_PUBLISHED = 'FULLY_PUBLISHED',
  ERROR_STATE = 'ERROR_STATE'
}
```

### 2. Smart Campaign Publish Service (`smartCampaignPublishService.ts`)

Handles intelligent publishing and retry logic:

```typescript
interface PublishResponse {
  success: boolean;
  message: string;
  stateInfo?: CampaignStateInfo;
  action: 'started' | 'resumed' | 'already_running' | 'error';
}
```

### 3. Enhanced Controller (`Controller.ts`)

Updated controller with detailed error responses and state information.

## API Endpoints

### 1. POST `/v2/campaigns/publish` (Enhanced)

**Request:**
```json
{
  "campaignId": 123
}
```

**Success Response:**
```json
{
  "campaignId": 123,
  "userId": 456,
  "action": "resumed",
  "currentState": "SMART_CONTRACT_FAILED",
  "message": "Campaign publishing resumed from smart contract transaction"
}
```

**Error Response (Recoverable):**
```json
{
  "success": false,
  "message": "Campaign requires admin approval before publishing",
  "stateInfo": {
    "currentState": "ERROR_STATE",
    "canRetry": false,
    "nextAction": "Wait for admin approval"
  },
  "action": "error",
  "details": {
    "campaignId": 123,
    "currentState": "ERROR_STATE",
    "canRetry": false,
    "nextAction": "Wait for admin approval"
  }
}
```

### 2. GET `/v2/campaigns/:campaignId/state` (New)

**Purpose**: Check campaign state without triggering any actions

**Response:**
```json
{
  "success": true,
  "stateInfo": {
    "currentState": "SMART_CONTRACT_FAILED",
    "canRetry": true,
    "nextAction": "Resume from smart contract transaction",
    "resumeFromStep": "SMART_CONTRACT",
    "campaign": { /* campaign data */ }
  },
  "details": {
    "campaignId": 123,
    "currentState": "SMART_CONTRACT_FAILED",
    "canRetry": true,
    "nextAction": "Resume from smart contract transaction",
    "resumeFromStep": "SMART_CONTRACT"
  }
}
```

## State Detection Logic

The system analyzes campaign database fields to determine state:

| Database State | tweet_id | contract_id | last_thread_tweet_id | Detected State | Action |
|---------------|----------|-------------|---------------------|----------------|---------|
| ApprovalPending/CampaignApproved | null | null | null | NOT_STARTED | Start fresh |
| ApprovalPending/CampaignApproved | exists | null | null | SMART_CONTRACT_FAILED | Resume from contract |
| ApprovalPending/CampaignApproved | exists | exists | null | SECOND_TWEET_FAILED | Resume from second tweet |
| CampaignStarted | null | null | null | NOT_STARTED | Start fresh |
| CampaignStarted | exists | null | null | SMART_CONTRACT_FAILED | Resume from contract |
| CampaignStarted | exists | exists | null | SECOND_TWEET_FAILED | Resume from second tweet |
| CampaignRunning | exists | exists | exists | FULLY_PUBLISHED | Already complete |

## Event Flow Resumption

### Scenario 1: Smart Contract Failure
```
Original Flow:
Client → CAMPAIGN_PUBLISH_CONTENT → First Tweet → CAMPAIGN_PUBLISH_DO_SM_TRANSACTION → [FAILS]

Resume Flow:
Client → Detect State → CAMPAIGN_PUBLISH_DO_SM_TRANSACTION (directly)
```

### Scenario 2: Second Tweet Failure
```
Original Flow:
... → CAMPAIGN_PUBLISH_DO_SM_TRANSACTION → Contract Success → CAMPAIGN_PUBLISH_SECOND_CONTENT → [FAILS]

Resume Flow:
Client → Detect State → CAMPAIGN_PUBLISH_SECOND_CONTENT (directly)
```

## Frontend Integration

### 1. Handle Enhanced Error Responses

```javascript
const publishCampaign = async (campaignId) => {
  try {
    const response = await fetch('/v2/campaigns/publish', {
      method: 'POST',
      body: JSON.stringify({ campaignId }),
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();

    if (response.ok) {
      // Success - show action taken
      switch(result.action) {
        case 'started':
          showToast('Campaign publishing started');
          break;
        case 'resumed':
          showToast('Campaign publishing resumed from where it left off');
          break;
        case 'already_running':
          showToast('Campaign is already running');
          break;
      }
    } else {
      // Error - show specific guidance
      if (result.stateInfo?.canRetry) {
        showError(`${result.message}. You can retry this campaign.`);
        showRetryButton(true);
      } else {
        showError(`${result.message}. ${result.stateInfo?.nextAction || 'Please contact support.'}`);
        showRetryButton(false);
      }
    }
  } catch (error) {
    showError('Network error. Please try again.');
  }
};
```

### 2. Check Campaign State Before Actions

```javascript
const checkCampaignState = async (campaignId) => {
  const response = await fetch(`/v2/campaigns/${campaignId}/state`);
  const result = await response.json();

  if (result.success) {
    return {
      canPublish: result.stateInfo.canRetry || result.stateInfo.currentState === 'FULLY_PUBLISHED',
      currentState: result.stateInfo.currentState,
      nextAction: result.stateInfo.nextAction,
      isComplete: result.stateInfo.currentState === 'FULLY_PUBLISHED'
    };
  }

  throw new Error(result.message);
};

// Usage in UI
const campaignState = await checkCampaignState(123);
if (campaignState.isComplete) {
  showButton('View Campaign', '/campaigns/123');
} else if (campaignState.canPublish) {
  showButton('Resume Publishing', () => publishCampaign(123));
} else {
  showMessage(campaignState.nextAction);
}
```

## Error Handling

### Campaign State Errors
- **Admin Approval Required**: `canRetry: false`, show "Wait for admin approval"
- **Already Running**: `canRetry: false`, show "Campaign is already published"
- **Inconsistent State**: `canRetry: false`, show "Contact support"

### Validation Errors
- **User Not Authorized**: Standard 401/403 error
- **Campaign Not Found**: Standard 404 error
- **Invalid Campaign ID**: 400 error with message

### Service Errors
- **Database Connection**: 500 error, suggest retry later
- **Event Publishing**: 500 error, campaign state preserved for retry

## Monitoring and Logging

### Key Log Points:
```
- Campaign state analysis: "Campaign 123 state analysis: SMART_CONTRACT_FAILED"
- Smart retry actions: "Resuming campaign 123 from smart contract step"
- State validation: "Campaign 123 can be resumed from: Resume from smart contract transaction"
```

### Metrics to Track:
- Campaign publish attempts by state
- Success rate of retry operations
- Common failure points in publish flow
- Time between failure and successful retry

## Benefits

1. **User Experience**: No more confusion about why campaigns can't be published
2. **Data Integrity**: No duplicate tweets or inconsistent blockchain state
3. **Efficiency**: Resume exactly where left off instead of starting over
4. **Transparency**: Clear visibility into campaign state and required actions
5. **Reliability**: Robust error handling and recovery mechanisms

## Migration Notes

### For Existing Campaigns:
- Campaigns with partial state will be automatically detected
- No database migration required
- Existing event flow continues to work
- Old publish attempts will use new smart retry logic

### For Frontend:
- Enhanced error responses provide more information
- New state endpoint available for diagnostics
- Backward compatible with existing publish flow
- Optional: Add state checking before publish attempts

---

## Usage Examples

### 1. Campaign Failed at Smart Contract
```bash
# Check state
curl -X GET "/v2/campaigns/123/state"
# Response: currentState: "SMART_CONTRACT_FAILED", canRetry: true

# Retry publishing - will skip first tweet and go directly to contract
curl -X POST "/v2/campaigns/publish" -d '{"campaignId": 123}'
# Response: action: "resumed", message: "resumed from smart contract transaction"
```

### 2. Campaign Already Published
```bash
# Attempt to publish again
curl -X POST "/v2/campaigns/publish" -d '{"campaignId": 123}'
# Response: action: "already_running", message: "Campaign is already published and running"
```

This system ensures reliable, user-friendly campaign publishing with intelligent error recovery and clear state visibility.
