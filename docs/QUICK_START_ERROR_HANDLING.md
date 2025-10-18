# Contract Error Handling - Quick Start Guide

## Overview

Your contract error handling system has been successfully enhanced! 🎉

When contract transactions fail, instead of seeing:
```
Error: CONTRACT_REVERT_EXECUTED
```

You'll now see:
```
Contract execution failed: E005: Token not whitelisted
Transaction: 0.0.2661086@1760469031.558756400
View details: https://hashscan.io/testnet/transaction/0.0.2661086@1760469031.558756400
```

## What's New

### 1. New Files Created

- **`src/services/ContractErrorHandler.ts`** - Core error handling utilities
- **`src/services/ContractErrorHandler.examples.ts`** - Usage examples
- **`docs/CONTRACT_ERROR_HANDLING.md`** - Comprehensive documentation
- **`docs/CONTRACT_ERROR_HANDLING_IMPLEMENTATION.md`** - Implementation summary

### 2. Updated Files

- **`src/services/Contract.ts`** - Enhanced error handling in `callContractWithStateChange()` method

## How to Use

### Basic Usage (Already Integrated!)

Your existing code will automatically benefit from enhanced error messages. No changes required!

```typescript
const result = await contract.callContractWithStateChange('addCampaigner', params);

if (result.error) {
  console.log(result.errorMessage);
  // Now shows: "Contract execution failed: E003: Campaigner not allowed"
  // Instead of: "CONTRACT_REVERT_EXECUTED"
}
```

### Advanced Usage

#### Get Detailed Error Information

```typescript
import { getContractErrorDetails } from './services/ContractErrorHandler';

const errorDetails = await getContractErrorDetails(transactionId, contractInstance);

console.log(errorDetails.decodedError);  // "E005: Token not whitelisted"
console.log(errorDetails.errorCode);     // "E005"
console.log(errorDetails.hashscanUrl);   // "https://hashscan.io/testnet/transaction/..."
```

#### Use EnhancedContractError

```typescript
import { EnhancedContractError } from './services/ContractErrorHandler';

throw new EnhancedContractError({
  message: 'Token not whitelisted',
  errorCode: 'E005',
  transactionId: '0.0.2661086@1760469031.558756400',
});
```

#### API Response with Error Details

```typescript
if (result.error) {
  const errorCodeMatch = result.errorMessage.match(/E0(0[1-9]|1[0-7])/);
  
  return res.status(400).json({
    success: false,
    error: result.errorMessage,
    errorCode: errorCodeMatch ? errorCodeMatch[0] : undefined,
    transactionId: result.transactionId,
  });
}
```

## Error Codes Reference

| Code | Meaning |
|------|---------|
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

## Testing the Implementation

### 1. Trigger a Known Error

Try to create a campaign with a non-whitelisted token:

```typescript
const result = await contract.callContractWithStateChange(
  'createCampaign',
  paramsWithNonWhitelistedToken
);

// Check the logs - should show:
// "Decoded contract error: E005: Token not whitelisted"
```

### 2. Check the Logs

Look in `logs/jet-logger.log` for detailed error information:

```
[ERROR] ReceiptStatusError: ...
[ERROR] Decoded contract error: E005: Token not whitelisted
[ERROR] Enhanced error details: {"errorCode":"E005","transactionId":"...","hashscanUrl":"..."}
```

### 3. Visit Hashscan

Copy the Hashscan URL from the logs and verify the error message matches.

## Configuration

Ensure your environment variables are set:

```env
HEDERA_NETWORK=testnet  # or mainnet
HEDERA_ACCOUNT_ID=0.0.xxxx
HEDERA_PRIVATE_KEY=...
```

## Next Steps

### 1. Update API Endpoints

Add error code and Hashscan URL to your API responses:

```typescript
app.post('/api/campaign/create', async (req, res) => {
  const result = await createCampaign(req.body);
  
  if (result.error) {
    const errorCode = extractErrorCode(result.errorMessage);
    
    return res.status(400).json({
      success: false,
      error: result.errorMessage,
      errorCode,
      transactionId: result.transactionId,
      // Add Hashscan URL for transparency
      viewTransaction: `https://hashscan.io/${network}/transaction/${result.transactionId}`,
    });
  }
  
  return res.json({ success: true, transactionId: result.transactionId });
});
```

### 2. Frontend Integration

Display the detailed error to users:

```typescript
if (response.errorCode === 'E005') {
  showNotification({
    type: 'error',
    title: 'Token Not Whitelisted',
    message: 'This token is not whitelisted for campaigns. Please contact support.',
    action: {
      label: 'View Transaction',
      url: response.viewTransaction,
    },
  });
}
```

### 3. Error Analytics

Track error patterns:

```typescript
import { getContractErrorDetails } from './services/ContractErrorHandler';

// When a contract error occurs
const errorDetails = await getContractErrorDetails(transactionId, contract);

// Send to analytics
analytics.track('ContractError', {
  errorCode: errorDetails.errorCode,
  function: functionName,
  timestamp: errorDetails.timestamp,
});
```

### 4. Smart Retry Logic

Only retry errors that might be transient:

```typescript
const RETRYABLE_ERRORS = ['E008', 'E013']; // Insufficient balance, etc.

if (result.error) {
  const errorCode = extractErrorCode(result.errorMessage);
  
  if (errorCode && RETRYABLE_ERRORS.includes(errorCode)) {
    // Retry the transaction
    await retryWithBackoff(() => executeTransaction());
  } else {
    // Don't retry - inform user
    return { error: result.errorMessage, errorCode };
  }
}
```

## Examples

See `src/services/ContractErrorHandler.examples.ts` for complete examples:

1. Basic error handling
2. Detailed error analysis
3. Using EnhancedContractError class
4. API endpoint integration
5. Smart retry logic
6. Error code handling

## Troubleshooting

### "Error message not decoded"

**Check:**
1. Contract ABI is correct and includes error definitions
2. Transaction ID is being extracted correctly
3. Hedera client has permission to query transaction records

**Solution:**
Look at the logs - if you see "Could not fetch transaction record", ensure your Hedera client configuration is correct.

### "Hashscan URL not generated"

**Check:**
1. `HEDERA_NETWORK` environment variable is set
2. Transaction ID format is correct (0.0.xxxx@seconds.nanos)

### "Error code not extracted"

**Check:**
Your Solidity contract error messages include the error code format (E001-E017)

Example in Solidity:
```solidity
require(isWhitelisted[token], "E005: Token not whitelisted");
```

## Resources

- **Full Documentation**: `docs/CONTRACT_ERROR_HANDLING.md`
- **Implementation Details**: `docs/CONTRACT_ERROR_HANDLING_IMPLEMENTATION.md`
- **Code Examples**: `src/services/ContractErrorHandler.examples.ts`
- **Hedera Docs**: https://docs.hedera.com/hedera

## Questions?

1. Check the comprehensive documentation in `docs/CONTRACT_ERROR_HANDLING.md`
2. Review the examples in `ContractErrorHandler.examples.ts`
3. Look at the logs in `logs/jet-logger.log`
4. Contact the development team with transaction ID and error details

---

**Status**: ✅ Fully implemented and ready to use!

**Testing**: Trigger a contract error and check the logs to see the enhanced error messages in action.
