# Test script to verify media upload fix

## Issue: "request entity too large" error in V201 media endpoints

### Root Cause:
The server's `express.json()` middleware had a default limit of ~100kb, but media files (even after multer processing) were being added to `req.body.media` and exceeding this limit.

### Fixes Applied:

1. **Increased express body limits** in `src/server/core.ts`:
   ```typescript
   app.use(express.json({ limit: '10mb' }));
   app.use(express.urlencoded({ extended: true, limit: '10mb' }));
   ```

2. **Optimized media middleware** in `src/V201/MiddleWare/media/storeToS3.ts`:
   - Now stores only essential file metadata instead of full file data
   - Added better error handling and cleanup
   - Reduced payload size significantly

3. **Added specific error handling** for payload too large errors with helpful error messages

### File Limits:
- **Multer file limit**: 2MB per file (unchanged)
- **Express body limit**: 10MB (increased from ~100kb)
- **Max files**: 2 files per request (unchanged)

### Test Endpoints:
- `POST /api/v201/campaign/draft` - Create campaign with media
- `GET /api/v201/evolving-nft/status` - New evolving NFT service status

### Expected Behavior:
- Media uploads up to 2MB per file should now work without "request entity too large" error
- Better error messages for actual oversized payloads
- Proper cleanup of temporary files

### To Test:
1. Try uploading images (< 2MB each) via V201 campaign endpoints
2. Verify media files are uploaded to S3 successfully
3. Check that temporary files are cleaned up properly
