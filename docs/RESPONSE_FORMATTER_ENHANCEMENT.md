# Response Formatter Enhancement Documentation

## Overview
Enhanced the response formatter middleware and implemented it across the Quest Controller to provide standardized, type-safe API responses.

## Changes Made

### 1. Enhanced Response Formatter (`src/server/config/responseFormatter.ts`)

#### New Features Added:
- **Additional HTTP Status Codes**: Added `BAD_REQUEST`, `CONFLICT`, and `UNPROCESSABLE_ENTITY`
- **New Response Methods**:
  - `badRequest()` - 400 Bad Request
  - `conflict()` - 409 Conflict
  - `validationError()` - 422 Unprocessable Entity
  - Enhanced `notFound()` with resource parameter
  - Enhanced `internalServerError()` with error details (dev mode only)

#### Improvements:
- **Metadata Support**: All success methods now accept optional `metadata` parameter
- **Better Data Serialization**: Centralized `serializeData()` helper for BigInt handling
- **Optional Data**: Data parameter is now optional in success responses
- **Enhanced Error Handling**: Better error structure with optional error details
- **Type Safety**: Improved TypeScript definitions with proper type annotations

#### Response Structure:

**Success Response:**
```json
{
  "status": "success",
  "message": "Operation completed",
  "data": { ... },
  "metadata": { ... }  // optional
}
```

**Error Response:**
```json
{
  "status": "error",
  "message": "Error description",
  "errors": { ... },   // optional
  "metadata": { ... }  // optional
}
```

### 2. Quest Controller Updates (`src/V201/Modules/quest/Controller.ts`)

#### Enhancements:
- **Type-Safe Error Handling**: Added `getErrorMessage()` helper function
- **Consistent Response Methods**: All endpoints now use standardized response methods
- **Improved Error Messages**: More descriptive and user-friendly messages
- **Better Authorization**: Consistent unauthorized response handling
- **Metadata in Responses**: Pagination info in `getAllQuestCampaigns()`
- **Not Found Handling**: Specific handling for resource not found scenarios

#### Methods Updated:

1. **draftQuestCampaign**
   - ✅ `res.created()` for successful draft creation
   - ✅ `res.unauthorized()` for missing user
   - ✅ `res.badRequest()` with error details

2. **publishQuestCampaign**
   - ✅ `res.success()` for successful publication
   - ✅ `res.unauthorized()` for missing user
   - ✅ `res.badRequest()` for errors

3. **getQuestState**
   - ✅ `res.success()` for placeholder response
   - ✅ `res.unauthorized()` for missing user
   - ✅ `res.badRequest()` for errors

4. **getQuestSubmissions**
   - ✅ `res.success()` for placeholder response
   - ✅ `res.unauthorized()` for missing user
   - ✅ `res.badRequest()` for errors

5. **gradeQuestSubmissions**
   - ✅ `res.success()` for placeholder response
   - ✅ `res.unauthorized()` for missing user
   - ✅ `res.badRequest()` for errors

6. **closeQuestCampaign**
   - ✅ `res.success()` for placeholder response
   - ✅ `res.unauthorized()` for missing user
   - ✅ `res.badRequest()` for errors

7. **getAllQuestCampaigns**
   - ✅ `res.success()` with pagination metadata
   - ✅ `res.unauthorized()` for missing user
   - ✅ `res.badRequest()` for errors

8. **getQuestCampaignById**
   - ✅ `res.success()` for found quest
   - ✅ `res.notFound()` for missing quest
   - ✅ `res.unauthorized()` for missing user
   - ✅ `res.badRequest()` for other errors

## Benefits

### 1. Consistency
- All API responses follow the same structure
- Predictable error handling across endpoints
- Standard status codes and messages

### 2. Type Safety
- Full TypeScript support
- Compile-time error checking
- Better IDE autocomplete

### 3. Developer Experience
- Simplified response handling
- No more manual status code management
- Clear, self-documenting code

### 4. Maintainability
- Centralized response logic
- Easy to update response format globally
- Reduced code duplication

### 5. Client-Friendly
- Consistent response structure for frontend
- Better error messages
- Metadata support for pagination, etc.

## Usage Examples

### Success Response
```typescript
// Simple success
res.success(data, 'Operation successful');

// With metadata
res.success(data, 'Quests retrieved', { page: 1, limit: 10 });
```

### Created Response
```typescript
res.created(newQuest, 'Quest created successfully');
```

### Error Responses
```typescript
// Bad request
res.badRequest('Invalid input', validationErrors);

// Unauthorized
res.unauthorized('Authentication required');

// Not found
res.notFound('Quest not found', 'Quest with ID: 123');

// Validation error
res.validationError('Validation failed', errors);
```

## Migration Guide

### Before:
```typescript
return res.status(200).json({
  success: true,
  data: result
});

return res.status(400).json({
  message: error.message
});
```

### After:
```typescript
return res.success(result, 'Operation successful');

return res.badRequest(error.message);
```

## Future Enhancements

1. **Rate Limiting Responses**: Add `res.tooManyRequests()`
2. **Pagination Helper**: Dedicated pagination response method
3. **Response Caching**: Cache control headers
4. **API Versioning**: Version-specific response formats
5. **Response Compression**: Automatic compression for large responses

## Testing Recommendations

1. Test all response methods with various data types
2. Verify BigInt serialization works correctly
3. Test error responses in development vs production
4. Validate metadata is properly included
5. Test edge cases (null, undefined, empty data)

## Notes

- The response formatter is applied as Express middleware
- BigInt values are automatically serialized using `json-bigint`
- Error details are only included in development environment
- All methods are type-safe and work with TypeScript strict mode
