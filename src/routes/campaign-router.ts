import { checkCampaignBalances, handleAddNewCampaignNew, handleCampaignGet, handleCampaignStats, makeCardRunning, rewardDetails } from "@controller/Campaign";
import { twitterCardStatsData } from "@controller/User";
import { openAi } from "@controller/openAi";
import userInfo from "@middleware/userInfo";
import { CampaignCommands } from "@services/CampaignLifeCycleBase";
import { checkErrResponse } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body, query as validateQuery } from "express-validator";


const router = Router();

const AllowedCampaignCommands: CampaignCommands[] = Object.values(CampaignCommands)

router.post("/update-status", body("card_id").isNumeric(), body("campaign_command").isIn(AllowedCampaignCommands), checkErrResponse, makeCardRunning);
router.get("/all", userInfo.getCurrentUserInfo, handleCampaignGet);
// router.post("/add-new", userInfo.getCurrentUserInfo, handleAddNewCampaign);
router.post("/add-new", userInfo.getCurrentUserInfo, handleAddNewCampaignNew);
router.post("/stats", body("card_id").isNumeric(), checkErrResponse, handleCampaignStats);
router.get("/balance", validateQuery("campaignId").isNumeric(), checkErrResponse, checkCampaignBalances);
router.get("/card-status", twitterCardStatsData);
router.get("/reward-details", rewardDetails);
router.post("/chatgpt", validateQuery("message").isString(), openAi);
export default router;
