import { Router } from 'express';
import asyncHandler from '@shared/asyncHandler';
import userInfo from '@middleware/userInfo';
import admin from '@middleware/admin';
import BotExceptionController from '../Modules/engagements/BotExceptionController';

const router = Router();

// Test endpoint to check if the service is working (no auth required for debugging)
router.get('/test',
  asyncHandler((req, res) => {
    return res.success({
      message: 'Bot Exceptions API is working',
      timestamp: new Date().toISOString(),
      endpoints: [
        'GET /test - This test endpoint',
        'GET / - Get all exceptions (requires admin auth)',
        'POST / - Add exception (requires admin auth)',
        'DELETE /:twitterUserId - Remove exception (requires admin auth)',
        'GET /check/:twitterUserId - Check if user is excepted (requires admin auth)'
      ]
    });
  })
);

// All routes below require admin access for security
// Add bot detection exception (Admin only)
router.post('/',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(admin.isAdmin),
  asyncHandler(BotExceptionController.addException.bind(BotExceptionController))
);

// Remove bot detection exception (Admin only)
router.delete('/:twitterUserId',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(admin.isAdmin),
  asyncHandler(BotExceptionController.removeException.bind(BotExceptionController))
);

// Get all bot detection exceptions (Admin only)
router.get('/',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(admin.isAdmin),
  asyncHandler(BotExceptionController.getExceptions.bind(BotExceptionController))
);

// Check if user is in exception list (Admin only)
router.get('/check/:twitterUserId',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(admin.isAdmin),
  asyncHandler(BotExceptionController.checkException.bind(BotExceptionController))
);

export default router;
