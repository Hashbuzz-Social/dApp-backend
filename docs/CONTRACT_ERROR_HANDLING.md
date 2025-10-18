# Contract Error Handling System

## Overview

This document describes the enhanced contract error handling system implemented in the HashBuzz backend. The system provides detailed error information when smart contract transactions fail, including:

- Decoded error messages from contract reverts
- Smart contract error codes (E001-E017)
- Transaction IDs for tracking
- Hashscan URLs for viewing transaction details
- Human-readable error descriptions

## Architecture

### Components

1. **ContractErrorHandler.ts** - Centralized error handling utilities
2. **Contract.ts** - Enhanced contract execution with error handling
3. **ContractUtilsHandlers.ts** - Utility contract methods

### Key Classes and Functions

#### `getContractErrorDetails(transactionId, contractInstance)`

Fetches detailed error information from a failed contract transaction.

**Parameters:**
- `transactionId` (string): Transaction ID in format `0.0.xxxx@seconds.nanos`
- `contractInstance` (HederaContract, optional): Contract instance for error decoding

**Returns:** `ContractErrorDetails` object containing:
```typescript
{
  transactionId: string;
  errorMessage: string;
  decodedError?: string;
  errorCode?: string;
  hashscanUrl?: string;
  timestamp?: string;
}
```

**Example:**
```typescript
const errorDetails = await getContractErrorDetails(
  '0.0.2661086@1760469031.558756400',
  contractInstance
);

console.log(errorDetails.decodedError); // "E001: Invalid token address"
console.log(errorDetails.hashscanUrl); // "https://hashscan.io/testnet/transaction/..."
```

#### `EnhancedContractError` Class

A custom error class that extends JavaScript's `Error` with additional contract-specific information.

**Properties:**
- `errorCode` - Smart contract error code (E001-E017)
- `transactionId` - Hedera transaction ID
- `hashscanUrl` - Link to view transaction on Hashscan
- `decodedError` - Decoded error message from contract
- `humanReadableMessage` - User-friendly error description

**Methods:**
- `getFormattedMessage()` - Returns formatted error message with all details
- `toJSON()` - Returns JSON representation for logging/API responses

**Example:**
```typescript
const error = new EnhancedContractError({
  message: 'Token not whitelisted',
  errorCode: 'E005',
  transactionId: '0.0.2661086@1760469031.558756400',
  hashscanUrl: 'https://hashscan.io/testnet/transaction/0.0.2661086@1760469031.558756400'
});

console.log(error.getFormattedMessage());
// Output:
// Token not whitelisted - Token not whitelisted (E005)
// Transaction: https://hashscan.io/testnet/transaction/0.0.2661086@1760469031.558756400
```

#### `formatContractError(errorDetails)`

Formats contract error details into a user-friendly message.

**Example:**
```typescript
const formatted = formatContractError({
  transactionId: '0.0.2661086@1760469031.558756400',
  errorMessage: 'Token not whitelisted',
  errorCode: 'E005',
  hashscanUrl: 'https://hashscan.io/testnet/transaction/...'
});

console.log(formatted);
// Output:
// Transaction failed: Token not whitelisted (Error Code: E005)
//
// View transaction details: https://hashscan.io/testnet/transaction/...
```

## Smart Contract Error Codes

The system recognizes the following error codes:

| Code | Description |
|------|-------------|
| E001 | Invalid token address |
| E002 | Invalid campaign address |
| E003 | Campaigner not allowed |
| E004 | Campaign not closed |
| E005 | Token not whitelisted |
| E006 | Campaign already exists |
| E007 | Current balance is non-zero |
| E008 | Insufficient balance |
| E009 | Non-zero balance |
| E010 | Invalid expiry time |
| E011 | Total amount must be greater than zero |
| E012 | Mismatched input arrays |
| E013 | Total reward exceeds campaign balance |
| E014 | Campaign already closed |
| E015 | Token is not fungible |
| E016 | Invalid token type |
| E017 | Campaign expiry time not passed |

These codes are defined in your Solidity contracts and automatically extracted from error messages.

## Usage Examples

### 1. Basic Contract Execution with Error Handling

```typescript
const contract = new HederaContract(abi, contractId);

const result = await contract.callContractWithStateChange(
  'addCampaigner',
  new ContractFunctionParameters()
    .addAddress(campaignerAddress)
    .addUint256(1000)
);

if (result.error) {
  console.error('Transaction failed:', result.errorMessage);
  console.log('Transaction ID:', result.transactionId);
  // Error message will include decoded error if available
  // Example: "Contract execution failed: E003: Campaigner not allowed"
}
```

### 2. API Error Response

```typescript
app.post('/api/campaign/add-campaigner', async (req, res) => {
  try {
    const result = await contractUtils.addCampaigner(
      req.body.address,
      req.body.amount
    );

    if (result.error) {
      // Extract error code for specific handling
      const errorCodeMatch = result.errorMessage.match(/E0(0[1-9]|1[0-7])/);

      return res.status(400).json({
        success: false,
        error: result.errorMessage,
        errorCode: errorCodeMatch ? errorCodeMatch[0] : undefined,
        transactionId: result.transactionId,
        // You can also include Hashscan URL if available
      });
    }

    return res.status(200).json({
      success: true,
      transactionId: result.transactionId,
    });
  } catch (error) {
    logger.error('API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});
```

### 3. Advanced Error Handling with Enhanced Error Details

```typescript
try {
  const result = await contract.callContractWithStateChange(
    'createCampaign',
    params
  );

  if (result.error && result.transactionId) {
    // Get detailed error information
    const errorDetails = await getContractErrorDetails(
      result.transactionId,
      contract
    );

    // Send detailed error to monitoring service
    await monitoringService.logError({
      errorCode: errorDetails.errorCode,
      errorMessage: errorDetails.decodedError || errorDetails.errorMessage,
      transactionId: errorDetails.transactionId,
      hashscanUrl: errorDetails.hashscanUrl,
      timestamp: errorDetails.timestamp,
    });

    // Return user-friendly error
    throw new EnhancedContractError(errorDetails);
  }
} catch (error) {
  if (error instanceof EnhancedContractError) {
    console.error(error.getFormattedMessage());
    // Handle specific error codes
    if (error.errorCode === 'E005') {
      // Token not whitelisted - guide user to whitelist token
      showWhitelistingGuide();
    }
  }
}
```

## Error Flow Diagram

```
Contract Execution
       ↓
   Transaction
       ↓
   Success? ─── No ──→ ReceiptStatusError
       ↓                      ↓
      Yes              Extract Transaction ID
       ↓                      ↓
   Return Result      Fetch Transaction Record
                              ↓
                      Decode Error Message
                              ↓
                      Extract Error Code (E001-E017)
                              ↓
                      Generate Hashscan URL
                              ↓
                      Return Enhanced Error Details
```

## Implementation Notes

### Error Message Decoding

The system uses ethers.js to decode error messages from the contract function result:

1. **Standard Solidity Errors** - `Error(string)` with selector `0x08c379a0`
2. **Custom Errors** - Decoded using the contract ABI
3. **Raw Bytes** - Displayed as hex string if decoding fails

### Transaction Record Query

When a contract reverts, the system:

1. Extracts the transaction ID from the error message
2. Uses `TransactionRecordQuery` to fetch the full transaction record
3. Extracts the `contractFunctionResult` from the record
4. Decodes the error message using the contract's ABI

### Network Detection

The system automatically generates Hashscan URLs based on the network:
- `HEDERA_NETWORK=mainnet` → `https://hashscan.io/mainnet/transaction/...`
- `HEDERA_NETWORK=testnet` → `https://hashscan.io/testnet/transaction/...`

## Testing

### Unit Tests

Test the error handling with various scenarios:

```typescript
describe('Contract Error Handling', () => {
  it('should decode standard Solidity error', async () => {
    // Trigger E005: Token not whitelisted
    const result = await contract.callContractWithStateChange(
      'createCampaign',
      paramsWithNonWhitelistedToken
    );

    expect(result.error).toBe(true);
    expect(result.errorMessage).toContain('E005');
    expect(result.errorMessage).toContain('Token not whitelisted');
  });

  it('should provide Hashscan URL', async () => {
    const result = await contract.callContractWithStateChange(
      'invalidFunction',
      params
    );

    const errorDetails = await getContractErrorDetails(
      result.transactionId,
      contract
    );

    expect(errorDetails.hashscanUrl).toMatch(/hashscan\.io/);
  });
});
```

### Manual Testing

1. **Trigger a known error** (e.g., try to create campaign with non-whitelisted token)
2. **Check the logs** - Should show decoded error message
3. **Visit the Hashscan URL** - Should show same error message
4. **Verify error code extraction** - Should extract E001-E017 codes

## Troubleshooting

### Error Message Not Decoded

**Problem:** Error message shows generic "CONTRACT_REVERT_EXECUTED" instead of decoded message.

**Solutions:**
1. Verify the contract ABI is correct and includes error definitions
2. Check that the transaction ID is being extracted correctly
3. Ensure the Hedera client has permission to query transaction records
4. Check logs for any warnings about decoding failures

### Incorrect Error Code

**Problem:** Error code is not being extracted from the error message.

**Solutions:**
1. Verify the error message format matches the pattern `/E0(0[1-9]|1[0-7])/`
2. Check that your Solidity contract is reverting with the correct format
3. Update the error code mapping in `SMART_CONTRACT_ERRORS`

### Hashscan URL Not Generated

**Problem:** `hashscanUrl` is undefined in error details.

**Solutions:**
1. Verify `HEDERA_NETWORK` environment variable is set
2. Check that transaction ID was successfully extracted
3. Ensure the transaction ID format is correct

## Best Practices

1. **Always check for errors** - Check `result.error` after contract execution
2. **Log detailed errors** - Use `EnhancedContractError.toJSON()` for logging
3. **Provide Hashscan links** - Include in error messages for user debugging
4. **Handle specific error codes** - Implement custom handling for known errors
5. **Monitor error patterns** - Track error codes to identify common issues
6. **Test error scenarios** - Write tests for each error code

## Future Enhancements

1. **Error Analytics** - Track error frequency and patterns
2. **Auto-retry Logic** - Retry failed transactions with specific error codes
3. **User Notifications** - Send detailed error notifications to users
4. **Error Recovery Guides** - Provide context-specific recovery instructions
5. **Rate Limit Handling** - Smart backoff for rate-limited transactions

## Related Documentation

- [Campaign Publishing Architecture](./CAMPAIGN_PUBLISHING_ARCHITECTURE.md)
- [Campaign Rate Limit System](./CAMPAIGN_RATE_LIMIT_SYSTEM_DESIGN.md)
- [Campaign Smart Retry System](./CAMPAIGN_SMART_RETRY_SYSTEM.md)
- [Hedera SDK Documentation](https://docs.hedera.com/hedera/sdks-and-apis/sdks)

## Support

For questions or issues related to contract error handling:
1. Check the logs in `logs/jet-logger.log`
2. Review the transaction on Hashscan using the provided URL
3. Consult the smart contract source code for error definitions
4. Contact the development team with the transaction ID
