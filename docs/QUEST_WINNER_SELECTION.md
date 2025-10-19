# Quest Winner Selection Implementation

## Overview
Implemented the `findEligibleQuestWinners` function to determine eligible winners for quest campaigns based on correctness, duplicate detection, and bot detection.

## Implementation Date
October 19, 2025

## Business Logic

### Eligibility Criteria (All must be true):
1. **Correct Answer:** User's response matches the `correct_answer` field
2. **No Duplicate Entries:** User has only ONE engagement (multiple entries = disqualified)
3. **Anti-Sybil (Bot Detection):** `is_bot_engagement = false` (not a bot)

### Payment Status Assignment:
- **Eligible users:** `payment_status = UNPAID` (ready for reward distribution)
- **Ineligible users:** `payment_status = SUSPENDED` (disqualified)

### Reward Calculation:
```
reward_per_winner = campaign_budget / number_of_eligible_winners
```

## Files Created/Modified

### 1. `/src/V201/Modules/quest/services/findEligibleQuestWinners.ts`
**Main implementation file**

**Exports:**
- `findEligibleQuestWinners(questId: bigint): Promise<EligibleWinnersResult>`
- `EligibleWinnersResult` interface

**Process Flow:**
```typescript
1. Fetch quest campaign + all engagements
2. Group engagements by user_id → detect duplicates
3. For each engagement:
   - Check if answer is correct
   - Check if user has duplicate entries
   - Check if engagement is from bot
   - Determine eligibility
4. Update payment statuses in database transaction:
   - Eligible → UNPAID
   - Ineligible → SUSPENDED
5. Calculate reward per winner
6. Return detailed results
```

**Return Value:**
```typescript
{
  questId: bigint;
  totalResponses: number;
  correctResponses: number;
  duplicateEntries: number;
  botEngagements: number;
  eligibleWinners: number;
  suspendedEngagements: number;
  rewardPerWinner: number;
  processedAt: Date;
}
```

### 2. `/src/V201/Modules/quest/services/index.ts`
**Updated exports:**
```typescript
export { default as findEligibleQuestWinners } from './findEligibleQuestWinners';
export type { EligibleWinnersResult } from './findEligibleQuestWinners';
```

### 3. `/src/V201/Modules/quest/index.ts`
**Added services export:**
```typescript
export * from './services';
```

### 4. `/src/V201/Modules/campaigns/services/campaignClose/OnCloseQuestWinnersService.ts`
**Event handler for quest winner selection**

**Purpose:** Triggered by `CAMPAIGN_CLOSING_FIND_QUEST_WINNERS` event
**Function:** `processQuestWinnerSelection(eventData)`

**Features:**
- Calls `findEligibleQuestWinners()`
- Logs start/completion to campaign logs
- Detailed result logging with all metrics
- Error handling with campaign log integration

## Database Schema

### campaign_twittercard (Quest Campaign)
- `correct_answer`: String - The correct answer for the quest
- `campaign_budget`: Float - Total budget for rewards
- `question_options`: String[] - Multiple choice options

### campaign_tweetengagements (User Responses)
- `user_id`: String - Twitter user ID
- `engagement_type`: String - **STORES THE USER'S ANSWER**
- `is_bot_engagement`: Boolean - Bot detection result
- `payment_status`: payment_status enum - Eligibility status
- `is_valid_timing`: Boolean - Timing validation

## Disqualification Logic

### 1. Wrong Answer
```typescript
engagementAnswer.trim().toLowerCase() !== correctAnswer.trim().toLowerCase()
→ SUSPENDED
```

### 2. Duplicate Entries
```typescript
// User has multiple engagements for same quest
User A: [engagement_1, engagement_2]
→ BOTH SUSPENDED (all entries disqualified)
```

### 3. Bot Engagement
```typescript
is_bot_engagement === true
→ SUSPENDED
```

**Bot Detection Criteria:**
- Account age < 30 days
- Follower ratio > 50
- Tweet rate > 100/day

## Logging & Monitoring

### Campaign Logs Created:
1. **QUEST_WINNER_SELECTION_STARTED**
   - Event type: SYSTEM_EVENT
   - Level: INFO

2. **QUEST_WINNER_SELECTION_COMPLETED**
   - Event type: SYSTEM_EVENT
   - Level: SUCCESS
   - Metadata includes all metrics

3. **Error Logs** (if failure)
   - Context: 'quest_winner_selection'

### Console Logs:
```
[FindEligibleQuestWinners] Starting process for quest 123
[FindEligibleQuestWinners] Quest 123: Total responses = 500, Correct answer = "Option B"
[FindEligibleQuestWinners] User 1234567890 has 2 entries - DISQUALIFIED
[FindEligibleQuestWinners] Engagement 45 (User: 9876543210) - ELIGIBLE
[FindEligibleQuestWinners] Engagement 46 (User: 1111111111) - SUSPENDED (bot detected)
[FindEligibleQuestWinners] Quest 123 completed: 150 set to UNPAID, 350 set to SUSPENDED
```

## Usage Example

### Triggering the Process:
```typescript
// From OnCloseEngagementService.ts (after engagement collection)
if (campaignWithUser.campaign_type === campaign_type.quest) {
  publishEvent(CampaignEvents.CAMPAIGN_CLOSING_FIND_QUEST_WINNERS, {
    campaignId,
  });
}
```

### Direct Function Call:
```typescript
import findEligibleQuestWinners from '@V201/modules/quest';

const result = await findEligibleQuestWinners(BigInt(123));

console.log(`Eligible winners: ${result.eligibleWinners}`);
console.log(`Reward per winner: ${result.rewardPerWinner} HBAR`);
```

## Integration with Campaign Closing Flow

```
Campaign Closes
    ↓
CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_LIKE_AND_RETWEET
    ↓
Wait 5 minutes
    ↓
CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY
    ↓  (with bot detection)
    ↓
Check campaign_type:
    ├─ awareness → CAMPAIGN_CLOSING_RECALCULATE_REWARDS_RATES
    └─ quest → CAMPAIGN_CLOSING_FIND_QUEST_WINNERS  ← WE ARE HERE
                    ↓
              findEligibleQuestWinners()
                    ↓
              Set payment_status (UNPAID/SUSPENDED)
                    ↓
              [TODO] CAMPAIGN_CLOSING_DISTRIBUTE_REWARDS
```

## Performance Considerations

### Database Operations:
- **1 SELECT:** Fetch quest + all engagements (with includes)
- **1 TRANSACTION:** Update all engagement payment statuses
  - Uses `updateMany` for batch updates (2 queries)

### Memory Usage:
- **userEngagementMap:** O(U) where U = unique users
- **usersWithDuplicates:** O(D) where D = duplicate users
- **eligibleEngagementIds:** O(E) where E = eligible engagements
- **suspendedEngagementIds:** O(S) where S = suspended engagements

### Scalability:
- Efficient for 1,000+ responses
- All processing done in-memory
- Single transaction for database updates

## Testing Scenarios

### Test Case 1: Perfect Quest
```
- 100 responses
- 50 correct answers
- 0 duplicates
- 0 bots
→ Result: 50 eligible winners, 50 suspended
```

### Test Case 2: With Duplicates
```
- 100 responses
- 50 correct answers
- 10 users with 2 entries each (20 total)
→ Result: 30 eligible winners (50 - 20), 70 suspended
```

### Test Case 3: With Bots
```
- 100 responses
- 50 correct answers
- 15 bot engagements
→ Result: 35 eligible winners, 65 suspended
```

### Test Case 4: Complex
```
- 500 responses
- 200 correct answers
- 30 users with duplicates (60 entries)
- 40 bot engagements
→ Result: 100 eligible winners (200 - 60 - 40), 400 suspended
```

## Error Handling

### Validation Errors:
- Quest not found → Error thrown
- No correct_answer set → Error thrown
- Missing user_id → Warning logged, engagement suspended

### Database Errors:
- Transaction failure → All changes rolled back
- Error logged to campaign logs
- Exception propagated to event handler

## Future Enhancements

1. **Partial Credit:** Allow multiple correct answers with different weights
2. **Time Bonus:** Reward faster responses with bonus multiplier
3. **Answer Validation:** Support fuzzy matching for text answers
4. **Leaderboard:** Track and display top performers
5. **Analytics:** Add detailed analytics dashboard for quest performance

## Related Files
- `/src/V201/Modules/campaigns/services/campaignClose/OnCloseEngagementService.ts` - Triggers quest winner selection
- `/src/V201/Modules/engagements/botDetection.ts` - Bot detection logic
- `/prisma/schema.prisma` - Database schema
