import { checkCampaignBalances, claimReward, handleAddNewCampaignNew, handleCampaignGet, handleCampaignStats, makeCardRunning, rewardDetails } from "@controller/Campaign";
import { twitterCardStatsData } from "@controller/User";
import { openAi } from "@controller/openAi";
import userInfo from "@middleware/userInfo";
import { CampaignCommands } from "@services/CampaignLifeCycleBase";
import { checkErrResponse } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body, query as validateQuery } from "express-validator";


const router = Router();

const AllowedCampaignCommands:CampaignCommands[] = Object.values(CampaignCommands)

router.post("/update-status", body("card_id").isNumeric(), body("campaign_command").isIn(AllowedCampaignCommands), checkErrResponse, makeCardRunning);
router.get("/all", userInfo.getCurrentUserInfo, handleCampaignGet);
// router.post("/add-new", userInfo.getCurrentUserInfo, handleAddNewCampaign);
router.post("/add-new", userInfo.getCurrentUserInfo, handleAddNewCampaignNew);
router.post("/stats", body("card_id").isNumeric(), checkErrResponse, handleCampaignStats);
router.get("/balance",  validateQuery("campaignId").isNumeric(), checkErrResponse, checkCampaignBalances);
router.get("/card-status", twitterCardStatsData);
router.get("/reward-details", rewardDetails)
router.put("/claim-reward",body("contract_id").isString(),body("card_id").isNumeric(), claimReward);
router.post("/chatgpt",validateQuery("message").isString(), openAi);


// router.post("/send-rewards", body("campaignId").isNumeric(), checkErrResponse, async (_: Request, res: Response) => {
//   const campaignId: number = _.body.campaignId;
//   await SendRewardsForTheUsersHavingWallet(campaignId);
//   return res.status(OK).json({ success: true, message: "reward Distributed" });
// });

// router.post("/expirytest", body("campaignId").isNumeric(), checkErrResponse, async (_: Request, res: Response) => {
//   const id:string = _.body.campaignId;
//   // const data = await SendRewardsForTheUsersHavingWallet(id);
//   const cardDetails = await getCampaignDetailsById(parseInt(id.toString()));
//   if(cardDetails?.id) await closeCampaignSMTransaction(cardDetails.id);
//   return res.status(OK).json({message:"done"});
// });

export default router;
