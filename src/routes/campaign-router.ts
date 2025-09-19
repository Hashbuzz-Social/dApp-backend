import {
  checkCampaignBalances,
  handleAddNewCampaignNew,
  handleCampaignGet,
  handleCampaignStats,
  makeCardRunning,
  rewardDetails,
} from '@controller/Campaign';
import { Request, Response, NextFunction } from 'express';
import { MediaController } from '@controller/MediaController';
import { openAi } from '@controller/openAi';
import { twitterCardStatsData } from '@controller/User';
import { XTimelineController } from '@controller/XTimelineController';
import userInfo from '@middleware/userInfo';
import { CampaignCommands } from '@services/CampaignLifeCycleBase';
import { checkErrResponse } from '@validator/userRoutes.validator';
import { Router } from 'express';
import { body, query as validateQuery } from 'express-validator';
import { asyncHandler } from '@shared/asyncHandler';
// ...existing code...
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { parseQueryPagination } from '@middleware/pagination';
import logger from 'jet-logger';

// Middleware to add deprecation warnings for legacy campaign endpoints
const addDeprecationWarning = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.warn(
    `[DEPRECATED] Legacy campaign endpoint accessed: ${req.method} ${req.originalUrl}`
  );
  logger.warn(
    'Please migrate to V201 campaign endpoints: /api/v201/campaign/*'
  );

  // Add deprecation header
  res.set('X-API-Deprecated', 'true');
  res.set(
    'X-API-Deprecated-Message',
    'This endpoint is deprecated. Please use /api/v201/campaign/* endpoints for new campaigns with enhanced rewarding mechanism.'
  );

  next();
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsPath = path.join(__dirname, '..', '..', 'public', 'uploads');
    if (!fs.existsSync(uploadsPath)) {
      fs.mkdirSync(uploadsPath, { recursive: true });
    }
    cb(null, uploadsPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: fileFilter,
});

const router = Router();
const mediaController = new MediaController();
const AllowedCampaignCommands: CampaignCommands[] =
  Object.values(CampaignCommands);

// Route to update campaign status
router.post(
  '/update-status',
  body('card_id').isNumeric(),
  body('campaign_command').isIn(AllowedCampaignCommands),
  checkErrResponse,
  asyncHandler(makeCardRunning)
);

// Route to get all campaigns with pagination
// Usage: GET /all?page=1&limit=20
router.get(
  '/all',
  asyncHandler(userInfo.getCurrentUserInfo),
  parseQueryPagination,
  asyncHandler(handleCampaignGet)
);

// Route to add a new campaign
router.post(
  '/add-new',
  addDeprecationWarning,
  upload.array('media', 2),
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(handleAddNewCampaignNew)
);

// Route to add media to a campaign
router.post(
  '/add-media',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(mediaController.uploadMedia.bind(mediaController))
);

// Route to get campaign statistics
router.post(
  '/stats',
  body('card_id').isNumeric(),
  checkErrResponse,
  asyncHandler(handleCampaignStats)
);

// Route to check campaign balances
router.get(
  '/balance',
  validateQuery('campaignId').isNumeric(),
  checkErrResponse,
  asyncHandler(checkCampaignBalances)
);

// Route to get card status from Twitter
router.get('/card-status', asyncHandler(twitterCardStatsData));

// Route to get reward details
router.get(
  '/reward-details',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(rewardDetails)
);

// Route to interact with OpenAI
router.post(
  '/chatgpt',
  validateQuery('message').isString(),
  asyncHandler(openAi)
);

router.get(
  '/recent-tweets',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(XTimelineController.getRecentTweets.bind(XTimelineController))
);

export default router;
