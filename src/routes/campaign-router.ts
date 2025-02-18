import {
  checkCampaignBalances,
  handleAddNewCampaignNew,
  handleCampaignGet,
  handleCampaignStats,
  makeCardRunning,
  rewardDetails,
} from '@controller/Campaign';
import { MediaController } from '@controller/MediaController';
import { twitterCardStatsData } from '@controller/User';
import { openAi } from '@controller/openAi';
import { XTimelineController } from '@controller/XTimelineController';
import userInfo from '@middleware/userInfo';
import { CampaignCommands } from '@services/CampaignLifeCycleBase';
import { checkErrResponse } from '@validator/userRoutes.validator';
import { Router } from 'express';
import { body, query as validateQuery } from 'express-validator';
import multer from 'multer';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

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
router.post('/add-new',  upload.array('media' , 4),  userInfo.getCurrentUserInfo, handleAddNewCampaignNew);

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
router.get('/reward-details', rewardDetails);

// Route to interact with OpenAI
router.post('/chatgpt', validateQuery('message').isString(), openAi);

router.get(
  '/recent-tweets',
  userInfo.getCurrentUserInfo,
  XTimelineController.getRecentTweets.bind(XTimelineController)
);

export default router;
