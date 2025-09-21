# HashBuzz Campaign Publishing Architecture Documentation

## Overview

This document provides a comprehensive deep-dive into the HashBuzz backend architecture and what happens after a campaign is published. The system follows an event-driven architecture with Redis queues, background workers, and scheduled tasks to handle the complete campaign lifecycle.

## System Architecture Components

### Core Technologies
- **Node.js/Express**: Main backend framework
- **Prisma ORM**: Database interactions
- **Redis + BullMQ**: Event queuing system
- **Twitter API v2**: Social media interactions
- **DigitalOcean Spaces**: Media storage (S3-compatible)
- **Jet-Logger**: Logging system

### Key Architectural Patterns
- **Event-Driven Architecture**: Asynchronous event processing
- **Outbox Pattern**: Reliable event publishing
- **Queue-Based Processing**: Background job processing
- **Scheduler Pattern**: Time-based operations

## Campaign Publishing Flow - Step by Step

### Phase 1: Campaign Publish Initiation
**Entry Point**: `POST /v2/campaigns/:id/publish`
- **Controller**: `/src/V201/Modules/campaigns/controller/campaignController.ts`
- **Service**: `/src/V201/Modules/campaigns/services/campaignPublish/campaignPublish.ts`

```typescript
// Validates campaign and user eligibility
// Publishes initial event to start the chain
publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_CONTENT, {
  cardId: card.id,
  userId: cardOwner.id,
  type: card.type,
  createdAt: new Date(),
});
```

**What Happens:**
1. Campaign validation (status, user permissions, budget)
2. User authentication and eligibility checks
3. Campaign state verification
4. **Event Publication**: `CAMPAIGN_PUBLISH_CONTENT` event is published
5. Returns response to client immediately (non-blocking)

### Phase 2: Event Processing System

#### Event Publisher (`/src/V201/eventPublisher.ts`)
The event publisher implements the **Outbox Pattern**:

```typescript
export const publishEvent = async <T extends AppEvents>(
  eventName: T,
  eventData: EventDataType<T>
) => {
  // 1. Write to database outbox table (ensures persistence)
  const eventRecord = await prisma.eventOutBox.create({
    data: {
      event_name: eventName,
      event_data: JSON.stringify(eventData),
      created_at: new Date(),
      status: 'pending'
    }
  });
  
  // 2. Publish to Redis queue for immediate processing
  await redisQueue.publish(eventName, eventData);
}
```

#### Events Worker (`/src/V201/EventsWorker.ts`)
The EventsWorker is started at application boot and consumes events from Redis:

```typescript
class EventsWorker {
  async startConsuming() {
    // Consume events from Redis queue
    await redisQueue.consume(async (eventName, eventData) => {
      await this.handleEvent(eventName, eventData);
      // Clean up processed events from outbox
      await prisma.eventOutBox.deleteMany({
        where: { event_name: eventName, status: 'processed' }
      });
    });
  }
}
```

### Phase 3: Campaign Content Publishing

#### First Tweet Publication (`/src/V201/Modules/campaigns/services/campaignPublish/content.ts`)

When `CAMPAIGN_PUBLISH_CONTENT` is processed:

```typescript
export const publishCampaignInitialContent = async (eventData) => {
  // 1. Post first tweet to Twitter API
  const tweetResponse = await tweetService.publishFirstTweet(card, cardOwner);
  
  // 2. Update campaign with tweet ID
  await updateCampaign(card.id, { 
    tweet_id: tweetResponse.data.id 
  });
  
  // 3. Trigger next phase: Smart contract transaction
  publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_DO_SM_TRANSACTION, {
    cardId: card.id,
    userId: cardOwner.id,
    tweetId: tweetResponse.data.id
  });
}
```

### Phase 4: Smart Contract Integration

#### Transaction Processing (`/src/V201/Modules/campaigns/services/campaignPublish/publishtrnsaction.ts`)

When `CAMPAIGN_PUBLISH_DO_SM_TRANSACTION` is processed:

```typescript
const handleSmartContractTransaction = async (eventData) => {
  try {
    // 1. Initialize Hedera client
    const client = Client.forTestnet();
    
    // 2. Create contract transaction
    const contractTx = await new ContractExecuteTransaction()
      .setContractId(contractId)
      .setGas(200000)
      .setFunction("createCampaign", new ContractFunctionParameters()
        .addString(campaignData.title)
        .addUint256(campaignData.budget)
      )
      .execute(client);
      
    // 3. Update campaign with contract details
    await updateCampaign(cardId, {
      contract_id: contractTx.transactionId.toString(),
      contract_status: 'active'
    });
    
    // 4. Trigger second tweet publication
    publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_SECOND_CONTENT, {
      cardId,
      userId,
      contractId: contractTx.transactionId.toString()
    });
    
  } catch (error) {
    // Error handling - publish error event
    publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_ERROR, {
      cardId, userId, error: error.message
    });
  }
}
```

### Phase 5: Second Tweet and Campaign Activation

#### Second Tweet Publication
When `CAMPAIGN_PUBLISH_SECOND_CONTENT` is processed:

```typescript
const publishSecondContent = async (eventData) => {
  // 1. Publish second tweet (usually contains campaign link/details)
  const lastTweetThreadId = await tweetService.publishSecondThread(
    card, cardOwner, card.tweet_id
  );
  
  // 2. Update campaign status to RUNNING
  const updatedCard = await updateCampaign(card.id, {
    card_status: 'CampaignRunning',
    last_thread_tweet_id: lastTweetThreadId,
    campaign_start_time: new Date().toISOString(),
    campaign_close_time: calculateCloseTime(campaignDurationInMin)
  });
  
  // 3. Schedule campaign closing
  await SchedulerQueue.getInstance().addJob(
    CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION,
    {
      eventName: 'CAMPAIGN_CLOSE_OPERATION',
      data: { cardId: updatedCard.id, userId: cardOwner.id },
      executeAt: new Date(campaignCloseTime)
    }
  );
  
  // 4. Start engagement tracking
  const engagementTracker = new XEngagementTracker();
  await engagementTracker.startCampaignTracking(
    updatedCard.id,
    updatedCard.tweet_id,
    BigInt(cardOwner.id),
    durationHours
  );
}
```

### Phase 6: Ongoing Campaign Operations

#### Engagement Tracking (`/src/V201/Modules/campaigns/services/xEngagementTracker.ts`)

The engagement tracker runs in the background:

```typescript
class XEngagementTracker {
  async startCampaignTracking(campaignId, tweetId, userId, durationHours) {
    // 1. Set up periodic engagement polling
    const interval = setInterval(async () => {
      try {
        // 2. Fetch tweet metrics from Twitter API
        const metrics = await this.fetchTweetMetrics(tweetId);
        
        // 3. Update campaign engagement data
        await this.updateEngagementMetrics(campaignId, metrics);
        
        // 4. Check for auto-reward distribution triggers
        await this.checkAutoRewardTriggers(campaignId, metrics);
        
      } catch (error) {
        logger.err(`Engagement tracking error for campaign ${campaignId}: ${error.message}`);
      }
    }, 5 * 60 * 1000); // Every 5 minutes
    
    // 5. Clean up interval when campaign ends
    setTimeout(() => clearInterval(interval), durationHours * 60 * 60 * 1000);
  }
}
```

#### Scheduled Campaign Closing

The scheduler system handles time-based operations:

**Scheduler Queue** (`/src/V201/schedulerQueue.ts`):
```typescript
class SchedulerQueue {
  async addJob(eventName, jobData) {
    // Add delayed job to BullMQ
    await this.queue.add(eventName, jobData, {
      delay: jobData.executeAt.getTime() - Date.now()
    });
  }
}
```

**Schedule Job Handlers** (`/src/V201/SchedulesJobHandlers.ts`):
```typescript
const processCloseCampaignJob = async (job) => {
  const { cardId } = job.data.data;
  
  // 1. Fetch campaign from database
  const card = await prisma.campaign_twittercard.findUnique({
    where: { id: Number(cardId) },
    include: { user_user: true }
  });
  
  // 2. Execute campaign closing operation
  await completeCampaignOperation(card);
}
```

### Phase 7: Campaign Closing

#### Campaign Closing Service (`/src/services/campaign-service.ts`)

```typescript
export const completeCampaignOperation = async (card) => {
  // 1. Initialize closing lifecycle
  const closeCampaign = await CloseCampaignLifeCycle.create(card.id);
  
  // 2. Perform closing operations
  const result = await closeCampaign.performCloseCampaign();
  
  return result;
}
```

#### Closing Lifecycle (`/src/services/CloseCampaign.ts`)

The closing process includes:
1. **Engagement Final Calculation**: Last fetch of tweet metrics
2. **Reward Distribution**: Calculate and distribute rewards to participants
3. **Budget Refund**: Refund unused budget to campaign owner
4. **Contract Finalization**: Close smart contract and update blockchain state
5. **Status Updates**: Mark campaign as closed in database
6. **Event Publication**: Publish campaign closed events

```typescript
// Events published during closing:
publishEvent(CampaignEvents.CAMPAIGN_CLOSED, { cardId, finalMetrics });
publishEvent(CampaignEvents.CAMPAIGN_BUDGET_REFUND, { cardId, refundAmount });
publishEvent(CampaignEvents.CAMPAIGN_RATE_UPDATED, { cardId, finalRate });
```

## Event Flow Diagram

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client POST   │───▶│  campaignPublish │───▶│   Event Outbox  │
│   /publish      │    │    Service       │    │   (Database)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                 │                        │
                                 ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Redis Queue    │◀───│  EventPublisher │
                       │   (BullMQ)       │    │                 │
                       └──────────────────┘    └─────────────────┘
                                 │
                                 ▼
                       ┌──────────────────┐
                       │   EventsWorker   │
                       │  (Event Consumer)│
                       └──────────────────┘
                                 │
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │ Content Service │ │Transaction Svc  │ │  Close Service  │
    │ (First Tweet)   │ │(Smart Contract) │ │  (Scheduled)    │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
                                 │
                                 ▼
                       ┌──────────────────┐
                       │  Second Tweet +  │
                       │ Engagement Track │
                       └──────────────────┘
```

## Database Schema Impact

### Key Tables Updated During Campaign Lifecycle:

1. **`campaign_twittercard`**: Main campaign record
2. **`eventOutBox`**: Event persistence for reliability
3. **`campaign_engagement`**: Tweet metrics and engagement data
4. **`campaign_rewards`**: Participant rewards tracking
5. **`user_user`**: Budget updates and transaction history

### State Transitions:

```
CampaignDraft ──publish──▶ CampaignPending ──contract──▶ CampaignRunning ──schedule──▶ CampaignClosed
```

## Error Handling and Recovery

### Error Event Types:
- `CAMPAIGN_PUBLISH_ERROR`: Publishing failures
- `CAMPAIGN_CLOSING_ERROR`: Closing operation failures
- `CAMPAIGN_CONTRACT_ERROR`: Smart contract failures

### Recovery Mechanisms:
1. **Event Outbox**: Ensures events aren't lost during failures
2. **Retry Policies**: Configurable retry attempts for failed jobs
3. **Dead Letter Queues**: Failed events moved to DLQ for manual review
4. **State Rollback**: Ability to rollback campaign state on critical failures

## Monitoring and Observability

### Logging Points:
- Event publications and consumption
- Twitter API interactions
- Smart contract transactions
- Engagement tracking updates
- Campaign state transitions

### Health Checks:
- Redis queue connectivity
- Database connection health
- Twitter API rate limits
- Smart contract network status

## Performance Considerations

### Scalability Features:
1. **Asynchronous Processing**: Non-blocking campaign operations
2. **Queue-Based Architecture**: Handles traffic spikes gracefully
3. **Background Workers**: Separate processes for heavy operations
4. **Caching**: Redis caching for frequently accessed data

### Resource Management:
- Connection pooling for database and Redis
- Rate limiting for Twitter API calls
- Memory management for long-running workers
- Scheduled cleanup of processed events

---

## Summary

The HashBuzz campaign publishing system is built on a robust event-driven architecture that ensures reliable, scalable, and maintainable campaign operations. From the initial publish request to the final campaign closing, every step is handled asynchronously through events, ensuring the system can handle high loads while maintaining data consistency and reliability.

The key strengths of this architecture include:
- **Reliability**: Outbox pattern ensures no events are lost
- **Scalability**: Queue-based processing handles load efficiently  
- **Maintainability**: Clear separation of concerns and event-driven flow
- **Observability**: Comprehensive logging and monitoring at every step
- **Resilience**: Error handling and recovery mechanisms throughout