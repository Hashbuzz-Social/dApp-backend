# Quest Campaign API - Request Body Specifications

This document defines the expected request body structure and validation rules for all Quest Campaign POST endpoints.

## Table of Contents
- [POST /v2/quest/draft](#post-draft-quest-campaign)
- [POST /v2/quest/publish](#post-publish-quest-campaign)
- [POST /v2/quest/:questId/grade](#post-grade-quest-submissions)
- [POST /v2/quest/:questId/close](#post-close-quest-campaign)

---

## POST Draft Quest Campaign

**Endpoint:** `POST /v2/quest/draft`

**Description:** Creates a new quest campaign draft with media upload support.

### Request Body

```typescript
{
  name: string;                      // Required
  tweet_text: string;                // Required
  expected_engaged_users: number;    // Required
  campaign_budget: number;           // Required
  type: 'HBAR' | 'FUNGIBLE';        // Required
  fungible_token_id?: string;        // Optional (required when type='FUNGIBLE')
  media: string[];                   // Required
}
```

### Field Specifications

| Field | Type | Required | Validation Rules |
|-------|------|----------|------------------|
| `name` | string | ✅ Yes | - Must be 3-200 characters<br>- Cannot be empty<br>- Will be trimmed |
| `tweet_text` | string | ✅ Yes | - Must be 10-280 characters<br>- Cannot be empty<br>- Will be trimmed |
| `expected_engaged_users` | number | ✅ Yes | - Must be integer<br>- Min: 1, Max: 1,000,000<br>- Auto-converted from string |
| `campaign_budget` | number | ✅ Yes | - Must be positive number<br>- Min: 0.01<br>- Auto-converted from string |
| `type` | string | ✅ Yes | - Must be either 'HBAR' or 'FUNGIBLE'<br>- Case-sensitive |
| `fungible_token_id` | string | ⚠️ Conditional | - Required when `type='FUNGIBLE'`<br>- Must match format: `0.0.XXX`<br>- Example: `0.0.12345` |
| `media` | array | ✅ Yes | - Must be array of strings<br>- Max 4 items<br>- Each item must be a string (URL or path) |

### Example Requests

#### HBAR Quest Campaign
```json
{
  "name": "Daily Engagement Quest",
  "tweet_text": "Join our quest and earn HBAR! Share this post and tag 3 friends #HashBuzz #Quest",
  "expected_engaged_users": 500,
  "campaign_budget": 100.50,
  "type": "HBAR",
  "media": [
    "https://cdn.example.com/image1.jpg",
    "https://cdn.example.com/image2.jpg"
  ]
}
```

#### Fungible Token Quest Campaign
```json
{
  "name": "Token Reward Challenge",
  "tweet_text": "Complete this quest to earn exclusive tokens! #CryptoQuest #HashBuzz",
  "expected_engaged_users": 1000,
  "campaign_budget": 5000,
  "type": "FUNGIBLE",
  "fungible_token_id": "0.0.98765",
  "media": [
    "https://cdn.example.com/banner.png"
  ]
}
```

### Validation Errors

```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [
    {
      "type": "field",
      "value": "",
      "msg": "Quest campaign name is required",
      "path": "name",
      "location": "body"
    }
  ]
}
```

---

## POST Publish Quest Campaign

**Endpoint:** `POST /v2/quest/publish`

**Description:** Publishes a previously drafted quest campaign.

### Request Body

```typescript
{
  questId: string;  // Required - BigInt as string
}
```

### Field Specifications

| Field | Type | Required | Validation Rules |
|-------|------|----------|------------------|
| `questId` | string | ✅ Yes | - Must be numeric string<br>- Must be valid BigInt<br>- Cannot be empty<br>- Will be trimmed |

### Example Request

```json
{
  "questId": "123456789012345678"
}
```

### Validation Errors

```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [
    {
      "type": "field",
      "value": "abc123",
      "msg": "Quest ID must be a valid number",
      "path": "questId",
      "location": "body"
    }
  ]
}
```

---

## POST Grade Quest Submissions

**Endpoint:** `POST /v2/quest/:questId/grade`

**Description:** Grades multiple quest submissions and distributes rewards to approved submissions.

### Request Body

```typescript
{
  submissions: Array<{
    submissionId: string;        // Required
    approved: boolean;           // Required
    rewardAmount?: number;       // Optional (for approved submissions)
    rejectionReason?: string;    // Optional (for rejected submissions)
  }>;
}
```

### Field Specifications

| Field | Type | Required | Validation Rules |
|-------|------|----------|------------------|
| `submissions` | array | ✅ Yes | - Cannot be empty<br>- Min: 1 submission<br>- Max: 1000 submissions |
| `submissions[].submissionId` | string | ✅ Yes | - Cannot be empty<br>- Must be string |
| `submissions[].approved` | boolean | ✅ Yes | - Must be true or false |
| `submissions[].rewardAmount` | number | ❌ No | - Only for approved submissions<br>- Must be positive number |
| `submissions[].rejectionReason` | string | ❌ No | - Only for rejected submissions<br>- Max 500 characters |

### Example Request

```json
{
  "submissions": [
    {
      "submissionId": "sub_001",
      "approved": true,
      "rewardAmount": 10.5
    },
    {
      "submissionId": "sub_002",
      "approved": false,
      "rejectionReason": "Content does not meet quest requirements"
    },
    {
      "submissionId": "sub_003",
      "approved": true,
      "rewardAmount": 15.0
    }
  ]
}
```

### Validation Errors

```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [
    {
      "type": "field",
      "value": [],
      "msg": "At least one submission is required",
      "path": "submissions",
      "location": "body"
    }
  ]
}
```

---

## POST Close Quest Campaign

**Endpoint:** `POST /v2/quest/:questId/close`

**Description:** Manually closes a quest campaign before its scheduled end time.

### Request Body

```typescript
{
  reason?: string;           // Optional
  refundRemaining?: boolean; // Optional
}
```

### Field Specifications

| Field | Type | Required | Validation Rules |
|-------|------|----------|------------------|
| `reason` | string | ❌ No | - Max 1000 characters<br>- Will be trimmed |
| `refundRemaining` | boolean | ❌ No | - Auto-converted from string<br>- Defaults to false if not provided |

### Example Requests

#### With Reason
```json
{
  "reason": "Quest goals achieved earlier than expected. Closing to distribute rewards.",
  "refundRemaining": true
}
```

#### Minimal Request
```json
{
  "refundRemaining": false
}
```

#### Empty Request (All Optional)
```json
{}
```

### Validation Errors

```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [
    {
      "type": "field",
      "value": "Very long text that exceeds...",
      "msg": "Reason must be less than 1000 characters",
      "path": "reason",
      "location": "body"
    }
  ]
}
```

---

## URL Parameters

### Quest ID Parameter

All routes with `:questId` in the URL validate the parameter:

**Validation Rules:**
- Must be numeric string
- Must be valid BigInt
- Cannot be empty

**Valid Examples:**
- `/v2/quest/123/state` ✅
- `/v2/quest/987654321012345678/submissions` ✅

**Invalid Examples:**
- `/v2/quest/abc/state` ❌
- `/v2/quest/12.5/grade` ❌

---

## Common Response Formats

### Success Response
```json
{
  "status": "success",
  "message": "Quest draft created successfully",
  "data": {
    "questId": "123456789012345678",
    "campaignStatus": "Draft"
  }
}
```

### Validation Error Response
```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [
    {
      "type": "field",
      "value": "invalid_value",
      "msg": "Error message",
      "path": "field_name",
      "location": "body"
    }
  ]
}
```

### Business Logic Error Response
```json
{
  "status": "error",
  "message": "Quest campaign must be approved before publishing. Current status: Draft"
}
```

---

## Validation Middleware Chain

All POST routes follow this middleware chain:

1. **Route-specific validators** - Validate request body/params
2. **handleValidationErrors** - Check for validation errors
3. **userInfo.getCurrentUserInfo** - Extract user authentication
4. **Controller method** - Business logic execution

Example:
```typescript
questRouter.post(
  '/draft',
  tempStoreMediaOnDisk,           // 1. Handle file upload
  multerErrorHandler,              // 2. Handle upload errors
  validateDraftQuestBody,          // 3. Validate body
  handleValidationErrors,          // 4. Check validation results
  asyncHandler(userInfo.getCurrentUserInfo), // 5. Get user info
  asyncHandler(storeMediaToS3),    // 6. Upload to S3
  asyncHandler(QuestController.draftQuestCampaign) // 7. Create draft
);
```

---

## Type Definitions (TypeScript)

```typescript
// Draft Quest Body
export interface DraftQuestBody {
  name: string;
  tweet_text: string;
  expected_engaged_users: number;
  campaign_budget: number;
  type: 'HBAR' | 'FUNGIBLE';
  fungible_token_id?: string;
  media: string[];
}

// Publish Quest Body
export interface PublishQuestBody {
  questId: string;
}

// Grade Submissions Body
export interface GradeQuestSubmissionsBody {
  submissions: Array<{
    submissionId: string;
    approved: boolean;
    rewardAmount?: number;
    rejectionReason?: string;
  }>;
}

// Close Quest Body
export interface CloseQuestBody {
  reason?: string;
  refundRemaining?: boolean;
}
```

---

## Notes

1. **Type Conversion**: Numeric fields accept strings and auto-convert to numbers
2. **Trimming**: String fields are automatically trimmed
3. **Case Sensitivity**: Enum values (like `type: 'HBAR'`) are case-sensitive
4. **Array Validation**: Each array element is validated individually
5. **BigInt Handling**: Quest IDs are handled as strings to support BigInt values
6. **Media Upload**: The `/draft` endpoint supports multipart/form-data for file uploads

---

**Last Updated:** October 18, 2025
**API Version:** v2
