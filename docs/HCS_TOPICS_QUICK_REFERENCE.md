# HashBuzz HCS Topics - Quick Reference

## When Topics Are Submitted - Visual Timeline

### Campaign Lifecycle Flow

```flowchart
Campaign Creation → CAMPAIGN_CREATED ✅ HCS Topic: campaign-lifecycle
         ↓
Campaign Publishing → CAMPAIGN_PUBLISHED ✅ HCS Topic: campaign-lifecycle
         ↓
Rate Changes → RATE_UPDATED ✅ HCS Topic: campaign-lifecycle
         ↓
Campaign Closure → CAMPAIGN_CLOSED ✅ HCS Topic: campaign-lifecycle
         ↓
Budget Refund → BUDGET_REFUND ✅ HCS Topic: campaign-lifecycle
```

### Engagement Tracking Flow

```
Twitter API Call → Metrics Collection → ENGAGEMENT_TRACKED ✅ HCS Topic: engagement-tracking
     ↓                    ↓
Every 5-10 minutes    Database Storage
```

### Reward Distribution Flow

```
Engagement Detected → Reward Calculation → REWARD_DISTRIBUTED ✅ HCS Topic: reward-distribution
        ↓                      ↓
   Database Update      Hedera Transaction
```

### User Action Flow

```
User Login/Action → Validation → USER_ACTION ✅ HCS Topic: user-actions
        ↓               ↓
Security Check    Database Log
```

### Error Handling Flow

```
Any Critical Error → ERROR_EVENT ✅ HCS Topic: error-logs
         ↓
  System Recovery
```

### Transaction Flow

```
Any Hedera TX → Transaction Execution → TRANSACTION_RECORD ✅ HCS Topic: transaction-records
      ↓                    ↓
  Smart Contract      Network Confirmation
```

## Topic Summary Table

| Topic Name | Message Types | Frequency | Critical for Audit |
|------------|---------------|-----------|-------------------|
| **campaign-lifecycle** | CAMPAIGN_CREATED, CAMPAIGN_PUBLISHED, CAMPAIGN_CLOSED, RATE_UPDATED, BUDGET_REFUND | Per campaign event | ✅ YES |
| **engagement-tracking** | ENGAGEMENT_TRACKED | Every 5-10 minutes | ✅ YES |
| **reward-distribution** | REWARD_DISTRIBUTED | Per reward calculation | ✅ YES |
| **user-actions** | USER_ACTION | Per significant user action | ✅ YES |
| **transaction-records** | TRANSACTION_RECORD | Per blockchain transaction | ✅ YES |
| **error-logs** | ERROR_EVENT | Per critical error | ⚠️ Monitoring |

## Code Locations Where HCS Is Triggered

### Campaign Services
- `src/V201/Modules/campaigns/services/campaignPublish/campaignPublish.ts`
  - Lines ~54: Campaign publish success
  - Lines ~70: Campaign publish errors

### Engagement Services
- `src/V201/Modules/campaigns/services/xEngagementTracker.ts`
  - Lines ~301: Engagement metrics collection

### Event Publisher
- `src/V201/hcsEventPublisher.ts`
  - All HCS topic submissions are centralized here

### HCS Controller
- `src/controller/HCSController.ts`
  - REST API endpoints for querying HCS data

## Environment-Specific Topics

### Development/Testnet
```
Topics created with memo: "HashBuzz [TopicType] - DEV"
Network: Hedera Testnet
Cost per message: ~0.0001 HBAR (test)
```

### Production/Mainnet
```
Topics created with memo: "HashBuzz [TopicType]"
Network: Hedera Mainnet
Cost per message: ~0.0001 HBAR (real)
```

---

*For detailed implementation details, see HCS_TOPICS_SUBMISSION_GUIDE.md*
