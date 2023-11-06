/* eslint-disable max-len */
import { checkCampaignBalances, handleAddNewCampaign, handleCampaignGet, handleCampaignStats, statusUpdateHandler, statusUpdateHandlerFungible } from "@middleware/Campaign";
import userInfo from "@middleware/userInfo";
import { completeCampaignOperation } from "@services/campaign-service";
import { checkErrResponse } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body, query as validateQuery } from "express-validator";

const router = Router();
const campaignStatuses = ["rejected", "running", "completed", "deleted"];

router.post("/update-status", body("card_id").isNumeric(), body("card_status").isIn(campaignStatuses), checkErrResponse, statusUpdateHandler);
router.post("/update-status-fungible", body("card_id").isNumeric(), body("card_status").isIn(campaignStatuses), checkErrResponse, statusUpdateHandlerFungible);
router.get("/all", userInfo.getCurrentUserInfo, handleCampaignGet);
router.post("/add-new", userInfo.getCurrentUserInfo, handleAddNewCampaign);
router.post("/stats", body("card_id").isNumeric(), checkErrResponse, handleCampaignStats);
router.get("/balance", validateQuery("campaignId").isNumeric(), checkErrResponse, checkCampaignBalances);


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
