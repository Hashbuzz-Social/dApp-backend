# HashBuzz Evolving NFT Service

## Overview

The Evolving NFT service provides functionality for creating and managing Hedera Evolving NFTs within the HashBuzz platform. These NFTs can change their metadata over time, making them perfect for gaming elements, progressive rewards, and dynamic digital assets.

## Current Implementation Status

⚠️ **SDK Limitation Notice**: The current Hedera SDK version (2.44.0) does not fully support the evolving NFT functionality. The service is prepared for future SDK versions that will include `TokenUpdateNftsTransaction` and metadata key support.

### Available Features

✅ **Token Creation**: Create NFT collections with admin and supply keys
✅ **Minting**: Mint NFTs with rich metadata structure
✅ **Transfer**: Transfer NFTs between accounts
✅ **Role Upgrade**: Logic for role-based NFT evolution (placeholder)
✅ **Token Association**: Associate tokens with accounts

⚠️ **Future Features** (awaiting SDK support):
- True metadata evolution via `TokenUpdateNftsTransaction`
- Metadata key-based updates
- Real-time NFT transformation

## Service Architecture

### Core Components

1. **EvolvingNFTService** (`src/V201/services/evolvingNFTService.ts`)
   - Main service handling all evolving NFT operations
   - Manages Hedera client initialization
   - Handles key management for admin, supply, and metadata operations

2. **EvolvingNFTController** (`src/V201/controller/EvolvingNFTController.ts`)
   - REST API endpoints for all NFT operations
   - Request validation and error handling
   - Response formatting

3. **Routes** (`src/V201/routes/evolvingNFTRoutes.ts`)
   - Express router configuration
   - Endpoint definitions and middleware setup

## Configuration

### Required Secrets (Add to AppConfig)

```typescript
evolvingNFT?: {
  adminKey?: string,      // Admin key for NFT operations
  supplyKey?: string,     // Supply key for minting
  metadataKey?: string,   // Metadata key for evolving (future)
  treasuryAccount?: string // Default treasury account
}
```

Add these to your secrets configuration:

```json
{
  "evolvingNFT": {
    "adminKey": "302e020100300506032b65700422042...",
    "supplyKey": "302e020100300506032b65700422042...",
    "metadataKey": "302e020100300506032b65700422042...",
    "treasuryAccount": "0.0.1234567"
  }
}
```

## API Endpoints

### 1. Create Token Collection

**POST** `/api/v201/evolving-nft/create-token`

Creates a new evolving NFT token collection.

```json
{
  "tokenName": "HashBuzz Heroes",
  "tokenSymbol": "HBHERO",
  "maxSupply": 10000,
  "treasuryAccountId": "0.0.1234567",
  "memo": "HashBuzz Gaming NFTs"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tokenId": "0.0.2345678",
    "transactionId": "0.0.1234567@1695123456.789012345"
  },
  "message": "Evolving NFT token created successfully"
}
```

### 2. Mint NFTs

**POST** `/api/v201/evolving-nft/mint`

Mint new evolving NFTs with metadata.

```json
{
  "tokenId": "0.0.2345678",
  "metadata": [
    {
      "name": "Rookie Hero",
      "description": "A beginning hero ready to evolve",
      "image": "https://hashbuzz.social/nft/rookie.png",
      "attributes": [
        {"trait_type": "Role", "value": "Rookie"},
        {"trait_type": "Level", "value": 1},
        {"trait_type": "Experience", "value": 0}
      ],
      "level": 1,
      "experience": 0,
      "rarity": "common",
      "version": 1
    }
  ],
  "receiverAccountId": "0.0.9876543"
}
```

### 3. Evolve NFT (Placeholder)

**POST** `/api/v201/evolving-nft/evolve`

Currently logs evolution intent - will perform actual metadata updates in future SDK versions.

```json
{
  "tokenId": "0.0.2345678",
  "serialNumbers": [1],
  "newMetadata": {
    "name": "Experienced Hero",
    "level": 5,
    "experience": 1000,
    "rarity": "rare"
  },
  "evolutionReason": "Level up after completing 10 campaigns"
}
```

### 4. Transfer NFT

**POST** `/api/v201/evolving-nft/transfer`

Transfer NFT to another account.

```json
{
  "tokenId": "0.0.2345678",
  "serialNumber": 1,
  "fromAccountId": "0.0.1234567",
  "toAccountId": "0.0.9876543",
  "fromAccountKeyString": "302e020100300506032b657004220420..."
}
```

### 5. Upgrade Role

**POST** `/api/v201/evolving-nft/upgrade-role`

Upgrade NFT role with evolution logic.

```json
{
  "tokenId": "0.0.2345678",
  "serialNumber": 1,
  "currentRole": "rookie",
  "newRole": "influencer",
  "upgradeRequirements": {
    "minLevel": 10,
    "requiredExperience": 5000
  }
}
```

### 6. Get Service Status

**GET** `/api/v201/evolving-nft/status`

Returns current service initialization status.

```json
{
  "success": true,
  "data": {
    "initialized": true,
    "operatorAccount": "0.0.1234567",
    "hasAdminKey": true,
    "hasSupplyKey": true,
    "hasMetadataKey": true
  }
}
```

## NFT Metadata Structure

### EvolvingNFTMetadata Interface

```typescript
interface EvolvingNFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
  level?: number;
  experience?: number;
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
  lastEvolved?: string; // ISO timestamp
  version: number;
}
```

### Example Metadata Evolution

**Level 1 (Rookie):**
```json
{
  "name": "Rookie Influencer",
  "description": "Just starting their HashBuzz journey",
  "image": "https://hashbuzz.social/nft/rookie.png",
  "attributes": [
    {"trait_type": "Role", "value": "Rookie"},
    {"trait_type": "Level", "value": 1},
    {"trait_type": "Campaigns Completed", "value": 0}
  ],
  "level": 1,
  "experience": 0,
  "rarity": "common",
  "version": 1
}
```

**Level 10 (Evolved):**
```json
{
  "name": "Rising Influencer",
  "description": "An experienced HashBuzz campaigner",
  "image": "https://hashbuzz.social/nft/rising.png",
  "attributes": [
    {"trait_type": "Role", "value": "Rising Star"},
    {"trait_type": "Level", "value": 10},
    {"trait_type": "Campaigns Completed", "value": 25},
    {"trait_type": "Total Engagement", "value": 50000}
  ],
  "level": 10,
  "experience": 5000,
  "rarity": "rare",
  "lastEvolved": "2025-09-19T10:30:00.000Z",
  "version": 2
}
```

## HashBuzz Integration Use Cases

### 1. User Achievement NFTs

```typescript
// Mint achievement NFT when user completes first campaign
const achievementNFT = await evolvingNFTService.mintEvolvingNFT(
  "0.0.ACHIEVEMENT_TOKEN",
  [{
    name: "First Campaign Master",
    description: "Completed your first HashBuzz campaign",
    image: "https://hashbuzz.social/achievements/first-campaign.png",
    attributes: [
      {"trait_type": "Achievement", "value": "First Campaign"},
      {"trait_type": "Date Earned", "value": "2025-09-19"},
      {"trait_type": "Campaign ID", "value": 12345}
    ],
    level: 1,
    rarity: "common",
    version: 1
  }],
  userAccountId
);
```

### 2. Progressive Influencer Levels

```typescript
// Evolve user's influencer NFT based on performance
const evolutionResult = await evolvingNFTService.upgradeNFTRole({
  tokenId: userInfluencerTokenId,
  serialNumber: userNFTSerial,
  currentRole: "rookie",
  newRole: "rising-star",
  upgradeRequirements: {
    minLevel: 5,
    requiredExperience: 2500
  }
});
```

### 3. Campaign Participation Rewards

```typescript
// Mint participation NFTs that evolve with engagement
const campaignNFT = await evolvingNFTService.mintEvolvingNFT(
  "0.0.CAMPAIGN_REWARDS",
  [{
    name: `Campaign #${campaignId} Participant`,
    description: "Participated in HashBuzz campaign",
    attributes: [
      {"trait_type": "Campaign ID", "value": campaignId},
      {"trait_type": "Engagement Score", "value": 0}, // Will evolve
      {"trait_type": "Reward Tier", "value": "Bronze"}  // Will evolve
    ],
    level: 1,
    version: 1
  }]
);
```

## Future Enhancements

### When Full SDK Support is Available:

1. **Real-time Evolution**: True metadata updates via blockchain transactions
2. **Automatic Evolution**: Trigger evolution based on user actions/achievements
3. **Cross-Campaign Evolution**: NFTs that evolve across multiple campaigns
4. **Community Voting**: Let community vote on NFT evolution paths
5. **Marketplace Integration**: Evolving NFTs tradeable on secondary markets

### Integration with HCS Audit Trail:

```typescript
// Log NFT evolution to HCS for transparency
await hcsEventPublisher.publishEvent('NFT_EVOLVED', {
  tokenId: nftTokenId,
  serialNumber: nftSerial,
  evolutionType: 'role_upgrade',
  fromRole: 'rookie',
  toRole: 'influencer',
  evolutionTrigger: 'campaign_completion',
  metadata: newMetadata
});
```

## Error Handling

The service includes comprehensive error handling:

- **Initialization Failures**: Graceful fallback to operator keys
- **Transaction Failures**: Detailed error messages with transaction status
- **Validation Errors**: Input validation with helpful error messages
- **Network Issues**: Retry logic for network-related failures

## Security Considerations

1. **Key Management**: Dedicated keys for different operations
2. **Access Control**: Admin-only endpoints for token creation
3. **Input Validation**: Comprehensive validation of all inputs
4. **Error Logging**: Detailed logging without exposing sensitive data

---

*This service is designed to evolve alongside the Hedera SDK capabilities. Monitor Hedera SDK releases for enhanced evolving NFT features.*
