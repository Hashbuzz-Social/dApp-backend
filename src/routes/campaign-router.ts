import { completeCampaignOperation, getCampaignDetailsById, getRunningCardsOfUserId, updateCampaignStatus } from "@services/campaign-service";
import { allocateBalanceToCampaign } from "@services/transaction-service";
import {queryCampaignBalance} from "@services/smartcontract-service"
import {SendRewardsForTheUsersHavingWallet} from "@services/reward-service"
import userService from "@services/user-service";
import { sensitizeUserData } from "@shared/helper";
import { checkErrResponse } from "@validator/userRoutes.validator";
import { Request, Response, Router } from "express";
import { body , query as validateQuery } from "express-validator";
import statuses from "http-status-codes";

const router = Router();
const { OK, BAD_REQUEST, CONFLICT } = statuses;

router.post(
  "/update-status",
  body("card_id").isNumeric(),
  body("card_status").isIn(["rejected", "running", "completed", "deleted"]),
  checkErrResponse,
  stopCampaignHandler
);

router.get("/balance", validateQuery("campaignId").isNumeric() , checkErrResponse ,  async (_: Request, res: Response) => {
  const campaignId = _.query.campaignId as any as number;
  if(_.currentUser?.user_user.hedera_wallet_id){
    const data  = await queryCampaignBalance(_.currentUser?.user_user.hedera_wallet_id , campaignId);
    return res.status(OK).json(data);
  }
  return res.status(BAD_REQUEST).json({error:true , message:"Wallet address not found"})
});

router.post("/send-rewards", body("campaignId").isNumeric(), checkErrResponse ,  async (_: Request, res: Response) => {
  const campaignId:number = _.body.campaignId;
  await SendRewardsForTheUsersHavingWallet(campaignId);
  return res.status(OK).json({success:true , message:"reward Distributed"})
});

// router.get("/reward-test", query("id").isNumeric(), checkErrResponse, async (_: Request, res: Response) => {
//   const id = _.query["id"] as any as number;
//   const data = await SendRewardsForTheUsersHavingWallet(id);
//   return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(data)));
// });

async function stopCampaignHandler(req: Request, res: Response) {
  const campaignId: number = req.body.card_id;
  let requested_card_status: string = req.body.card_status;
  requested_card_status = requested_card_status.toLowerCase();

  const campaign_data = await getCampaignDetailsById(campaignId);
  const current_status_of_card = campaign_data?.card_status.toLocaleLowerCase();
  const campaignerId = campaign_data?.owner_id;
  let amounts = campaign_data?.campaign_budget;
  const campaignerAccount = campaign_data?.user_user?.hedera_wallet_id;

  //!! if card is in the same status don't update this card. respond with BAD_REQUEST
  if (current_status_of_card === requested_card_status) {
    return res.status(BAD_REQUEST).json({ error: true, message: "Card is currently in the same status." });
  }

  //!! if requested state is Running or rejected then current status of card must be pending.
  if (current_status_of_card === "pending" && !["running", "rejected"].includes(requested_card_status))
    return res.status(CONFLICT).json({ error: true, message: "Requested status updated will only be provided on pending card." });

  /**** ============= Update card to Running Status operation=================== */
  if (requested_card_status === "running" && campaign_data?.owner_id && amounts && campaignerId && campaignerAccount) {
    //? Check is there any running card for current card owner. We are allowing only one card running at a single moments.
    const currentRunningCardOfCardOwner = await getRunningCardsOfUserId(campaign_data?.owner_id);

    //! if any running account then status change will not allowed
    if (currentRunningCardOfCardOwner) return res.status(CONFLICT).json({ error: true, message: "Only one card is allowed at once." });

    //!  if any campaign_budget is grater than the card owner available_budget then status will remain same.
    if (campaign_data.campaign_budget && campaign_data.user_user?.available_budget && campaign_data.campaign_budget > campaign_data.user_user?.available_budget)
      return res.status(CONFLICT).json({ error: true, message: "Insufficient fund." });

    //! Now 1. - Do smartcontrct transaction for balance update.
    //! 2. Decrement the balance from card owner main account in db_available_budget;
    //! 3. Update the card status as per the requirements.
    amounts = Math.round(amounts * Math.pow(10, 8));

    const requests = await Promise.all([
      await allocateBalanceToCampaign(campaignId, amounts, campaignerAccount),
      await userService.topUp(campaignerId, amounts, "decrement"),
      await updateCampaignStatus(campaignId, "Running"),
    ]);

    return res.status(OK).json({ transaction: requests[0], user: sensitizeUserData(requests[1]) });
  }

  if (requested_card_status === "completed") {
    const { user_user, ...restCard } = campaign_data!;
    const completeCampaign = await completeCampaignOperation(restCard);
    return res.status(OK).json(completeCampaign);
  }

  return res.status(BAD_REQUEST).json({ error: true, message: "Something went wrong." });
}

export default router;
