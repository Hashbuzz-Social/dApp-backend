import {
  checkCampaignBalances,
  handleAddNewCampaignNew,
  handleCampaignGet,
  handleCampaignStats,
  makeCardRunning,
  rewardDetails,
} from '@controller/Campaign';
import { MediaController } from '@controller/MediaController';
import { openAi } from '@controller/openAi';
import { twitterCardStatsData } from '@controller/User';
import { XTimelineController } from '@controller/XTimelineController';
import userInfo from '@middleware/userInfo';
import { CampaignCommands } from '@services/CampaignLifeCycleBase';
import { checkErrResponse } from '@validator/userRoutes.validator';
import { Router } from 'express';
import { body, query as validateQuery } from 'express-validator';
import { Request } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';

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
  makeCardRunning
);

// Route to get all campaigns
router.get('/all', userInfo.getCurrentUserInfo, handleCampaignGet);

// Route to add a new campaign
router.post(
  '/add-new',
  upload.array('media', 2),
  userInfo.getCurrentUserInfo,
  handleAddNewCampaignNew
);

// Route to add media to a campaign
router.post(
  '/add-media',
  userInfo.getCurrentUserInfo,
  mediaController.uploadMedia.bind(mediaController)
);

// Route to get campaign statistics
router.post(
  '/stats',
  body('card_id').isNumeric(),
  checkErrResponse,
  handleCampaignStats
);

// Route to check campaign balances
router.get(
  '/balance',
  validateQuery('campaignId').isNumeric(),
  checkErrResponse,
  checkCampaignBalances
);

// Route to get card status from Twitter
router.get('/card-status', twitterCardStatsData);

// Route to get reward details
router.get('/reward-details',  userInfo.getCurrentUserInfo, rewardDetails);

// Route to interact with OpenAI
router.post('/chatgpt', validateQuery('message').isString(), openAi);

router.get(
  '/recent-tweets',
  userInfo.getCurrentUserInfo,
  XTimelineController.getRecentTweets.bind(XTimelineController)
);

export default router;
