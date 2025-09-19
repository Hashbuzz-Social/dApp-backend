# HashBuzz HCS Topic Submission Guide

This document provides a comprehensive overview of when and what HCS (Hedera Consensus Service) topics are submitted from the HashBuzz platform, making the audit trail transparent and visible.

## Overview

HashBuzz leverages HCS to create immutable audit trails for critical business events. All events are automatically logged to appropriate HCS topics for transparency, compliance, and auditability.

## HCS Topics and Message Types

### 1. Campaign Lifecycle Topic (`campaign-lifecycle`)

**Purpose**: Tracks the complete lifecycle of campaigns from creation to closure.

**Message Types Submitted**:
- `CAMPAIGN_CREATED`
- `CAMPAIGN_PUBLISHED`
- `CAMPAIGN_CLOSED`
- `RATE_UPDATED`
- `BUDGET_REFUND`

**When Messages Are Submitted**:

#### CAMPAIGN_CREATED
- **Trigger**: When a new campaign is successfully created
- **Location**: Campaign creation service
- **Data Includes**: Campaign ID, creator details, initial configuration

#### CAMPAIGN_PUBLISHED
- **Trigger**: When a campaign transitions from draft to active/running state
- **Location**: `src/V201/Modules/campaigns/services/campaignPublish/campaignPublish.ts`
- **Code Context**:
```typescript
// Campaign publish success
const eventResult = await hcsEventPublisher.publishCampaignEvent(
  CampaignEvents.CAMPAIGN_PUBLISH_CONTENT,
  { cardOwner, card }
);

// Campaign publish error
await hcsEventPublisher.publishCampaignEvent(
  CampaignEvents.CAMPAIGN_PUBLISH_ERROR,
  { campaignMeta, atStage, message, error }
);
```
- **Data Includes**: Campaign ID, publish timestamp, card owner information

#### CAMPAIGN_CLOSED
- **Trigger**: When a campaign is manually closed or reaches its end date
- **Data Includes**: Campaign ID, closure reason, final statistics

#### RATE_UPDATED
- **Trigger**: When campaign reward rates are modified
- **Data Includes**: Campaign ID, old rates, new rates, update reason

#### BUDGET_REFUND
- **Trigger**: When unused campaign budget is refunded to the campaigner
- **Data Includes**: Campaign ID, refund amount, transaction details

---

### 2. Engagement Tracking Topic (`engagement-tracking`)

**Purpose**: Records all Twitter engagement metrics for verification and transparency.

**Message Types Submitted**:
- `ENGAGEMENT_TRACKED`

**When Messages Are Submitted**:

#### ENGAGEMENT_TRACKED
- **Trigger**: After successfully collecting and storing Twitter engagement metrics
- **Location**: `src/V201/Modules/campaigns/services/xEngagementTracker.ts`
- **Code Context**:
```typescript
// Log engagement metrics to HCS for audit trail
await hcsEventPublisher.publishEngagementEvent(campaignId, {
  tweetId: '',
  metrics,
  collectedAt: new Date(),
});
```
- **Data Includes**:
  - Tweet ID
  - Metrics (likes, retweets, quotes, comments, total engagements, unique engagers)
  - Collection timestamp
  - Data source identifier

**Frequency**: Every time engagement metrics are collected (typically every few minutes for active campaigns)

---

### 3. Reward Distribution Topic (`reward-distribution`)

**Purpose**: Creates an immutable record of all reward calculations and distributions.

**Message Types Submitted**:
- `REWARD_DISTRIBUTED`

**When Messages Are Submitted**:

#### REWARD_DISTRIBUTED
- **Trigger**: When rewards are calculated and distributed to users
- **Location**: Reward calculation and distribution services
- **Data Includes**:
  - Campaign ID and User ID
  - Reward amount and token type (HBAR/Fungible)
  - Token ID (for fungible tokens)
  - Hedera transaction ID
  - Engagement type that triggered the reward
  - Detailed calculation breakdown
  - Distribution timestamp

**Integration Point**:
```typescript
await hcsEventPublisher.publishRewardEvent(campaignId, userId, {
  amount: calculatedAmount,
  tokenType: 'HBAR',
  transactionId: hederaTransactionId,
  engagementType: 'like',
  calculationDetails: { ... }
});
```

---

### 4. User Actions Topic (`user-actions`)

**Purpose**: Audit trail for important user account actions and security-related events.

**Message Types Submitted**:
- `USER_ACTION`

**When Messages Are Submitted**:

#### USER_ACTION
- **Trigger**: Important user actions that require audit logging
- **Potential Triggers**:
  - Account creation/registration
  - Profile updates
  - Security setting changes
  - Wallet connections/disconnections
  - Large transactions
  - Administrative actions

**Data Includes**:
- User ID
- Action description
- Detailed action parameters
- IP address (if available)
- User agent information
- Action timestamp

**Integration Point**:
```typescript
await hcsEventPublisher.publishUserActionEvent(
  userId,
  'wallet_connected',
  { walletAddress, walletType },
  ipAddress,
  userAgent
);
```

---

### 5. Transaction Records Topic (`transaction-records`)

**Purpose**: Records all blockchain transactions for financial transparency.

**Message Types Submitted**:
- `TRANSACTION_RECORD`

**When Messages Are Submitted**:

#### TRANSACTION_RECORD
- **Trigger**: Any Hedera blockchain transaction initiated by HashBuzz
- **Transaction Types**:
  - HBAR transfers (rewards)
  - Fungible token transfers
  - Smart contract interactions
  - Topic creation transactions
  - NFT transfers (if applicable)

**Data Includes**:
- Transaction ID
- Transaction type
- Amount and token details
- Sender and receiver account IDs
- Transaction status
- Gas fees
- Timestamp

---

### 6. Error Logs Topic (`error-logs`)

**Purpose**: Immutable record of critical system errors for debugging and monitoring.

**Message Types Submitted**:
- `ERROR_EVENT`

**When Messages Are Submitted**:

#### ERROR_EVENT
- **Trigger**: Critical system errors that impact user experience or data integrity
- **Error Types**:
  - Campaign publish failures
  - Reward distribution failures
  - API integration errors
  - Database connectivity issues
  - Hedera network errors

**Data Includes**:
- Error message and stack trace
- Affected user/campaign IDs
- System component that generated the error
- Recovery actions taken
- Error severity level
- Timestamp

## Message Structure

All HCS messages follow a standardized format:

```typescript
interface HCSMessage {
  messageType: HCSMessageType;
  timestamp: string;           // ISO 8601 format
  version: string;             // Message schema version
  userId?: bigint;             // Associated user ID
  campaignId?: bigint;         // Associated campaign ID
  transactionId?: string;      // Related Hedera transaction
  data: Record<string, any>;   // Event-specific payload
  signature?: string;          // Optional message signature
}
```

## Automatic Topic Creation

HashBuzz automatically creates and manages all required HCS topics during service initialization:

- **Campaign Lifecycle**: `0.0.XXXXXX` (Auto-created)
- **Engagement Tracking**: `0.0.XXXXXX` (Auto-created)
- **Reward Distribution**: `0.0.XXXXXX` (Auto-created)
- **User Actions**: `0.0.XXXXXX` (Auto-created)
- **Transaction Records**: `0.0.XXXXXX` (Auto-created)
- **Error Logs**: `0.0.XXXXXX` (Auto-created)

Topics are created with appropriate memo fields and configured for the current Hedera network (testnet/mainnet).

## Querying HCS Data

### REST API Endpoints

HashBuzz provides REST endpoints to query HCS audit trails:

- `GET /api/hcs/audit/campaign/:campaignId` - Campaign lifecycle events
- `GET /api/hcs/audit/user/:userId` - User action audit trail
- `GET /api/hcs/audit/engagements/:campaignId` - Engagement tracking data
- `GET /api/hcs/audit/rewards/:campaignId` - Reward distribution records
- `GET /api/hcs/messages` - Query messages by type, date range, etc.

### Query Parameters

All endpoints support:
- `startTime` / `endTime` - Date range filtering
- `messageType` - Filter by specific message types
- `limit` / `offset` - Pagination controls

## Data Retention and Access

- **Immutability**: All HCS data is permanently stored on Hedera's consensus layer
- **Public Access**: HCS messages can be queried by anyone using Hedera mirror nodes
- **Privacy**: Sensitive data is not stored in HCS; only audit-relevant information
- **Cost**: Each HCS message submission costs approximately 0.0001 HBAR

## Development and Testing

### Local Development
- Topics are created on Hedera testnet during development
- Test data is clearly marked with development identifiers
- Separate topic instances for different environments

### Production Deployment
- Topics are created on Hedera mainnet
- All messages are cryptographically signed
- Monitoring alerts for failed HCS submissions

## Compliance and Auditing

This HCS integration supports:
- **Financial Auditing**: Complete trail of all reward distributions
- **Engagement Verification**: Transparent tracking of social media metrics
- **Regulatory Compliance**: Immutable records for regulatory reporting
- **Dispute Resolution**: Verifiable evidence for user disputes
- **Security Monitoring**: Audit trail for security-related events

## Technical Implementation

### Service Architecture
- **HCS Service** (`src/services/hedera-consensus-service.ts`): Core HCS functionality
- **Event Publisher** (`src/V201/hcsEventPublisher.ts`): Event publishing abstraction
- **Integration Points**: Campaign services, engagement trackers, reward systems

### Error Handling
- Graceful fallback to database logging if HCS unavailable
- Retry mechanisms for failed submissions
- Detailed error logging for debugging

### Performance Considerations
- Asynchronous message submission to avoid blocking operations
- Message batching for high-volume events
- Efficient topic management and caching

---

*This document is automatically updated when new HCS integrations are added to the HashBuzz platform.*
