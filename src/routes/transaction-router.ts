import { getCampaignDetailsById } from "@services/campaign-service";
import { addCampaigner, getSMInfo, provideActiveContract } from "@services/smartcontract-service";
import { allocateBalanceToCampaign, createTopUpTransaction, reimbursementAmount, updateBalanceToContract } from "@services/transaction-service";
import userService from "@services/user-service";
import { checkErrResponse, checkWalletFormat } from "@validator/userRoutes.validator";
import { Request, Response, Router } from "express";
import { body } from "express-validator";
import statusCodes from "http-status-codes";
// import { topUpHandler } from "@controller/transaction.controller";

// Constants
const router = Router();
const { OK, CREATED, BAD_REQUEST, NON_AUTHORITATIVE_INFORMATION } = statusCodes;
// Paths

router.post("/create-topup-transaction", body("amounts").isObject(), body("connectedAccountId").custom(checkWalletFormat), checkErrResponse, creteTopUpHandler);
router.post("/top-up", body("amounts").isObject(), checkErrResponse, topUpHandler);
router.post("/addCampaigner", body("walletId").custom(checkWalletFormat), checkErrResponse, addCampaignerHandlers);
router.post("/activeContractId", body("accountId").custom(checkWalletFormat), checkErrResponse, activeContractHandler);
router.post("/add-campaign", body("campaignId").isNumeric(), checkErrResponse, handleCampaignFundAllocation);
router.post("/reimbursement" , body("amount").isNumeric(), checkErrResponse , handleReimbursement )
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.post("/contract-info", handleContractInfoReq);

//@handlers

//===============================

/****
 *@description top-up handler
 */

async function topUpHandler(req: Request, res: Response) {
  const accountId = req.currentUser?.user_user.hedera_wallet_id;
  const amounts: { topUpAmount: number; fee: number; total: number } = req.body.amounts;

  if (!amounts?.topUpAmount || !amounts.fee || !amounts.total) {
    return res.status(BAD_REQUEST).json({ error: true, message: "amounts is incorrect" });
  }

  if (req.currentUser?.user_id && accountId) {
    try {
      const topUp = await userService.topUp(req.currentUser?.user_id, amounts.topUpAmount, "increment");
      await updateBalanceToContract(accountId, amounts);
      return res.status(OK).json({ response: "success", available_budget: topUp.available_budget });
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
}

export default router;

//===============================

/*****
 * @description Add campaign to smart contract handler.
 **/
async function addCampaignerHandlers(req: Request, res: Response) {
  const walletId: string = req.body.walletId;

  const addWalletAddressToCampaign = await addCampaigner(walletId, req.currentUser?.user_id);
  return res.status(CREATED).json(addWalletAddressToCampaign);
}

//===============================

/****
 *
 *@description Check active contract and return to the user.
 */

async function activeContractHandler(req: Request, res: Response) {
  const activeContract = await provideActiveContract();
  return res.status(OK).json(activeContract);
}

//===============================

/****
 *@description this function is handling crete topup transaction
 */

async function creteTopUpHandler(req: Request, res: Response) {
  const payeeId = req.currentUser?.user_user.hedera_wallet_id;
  const connectedAccountId: string = req.body.connectedAccountId;
  const amounts: { topUpAmount: number; fee: number; total: number } = req.body.amounts;

  if (!amounts?.topUpAmount || !amounts.fee || !amounts.total) {
    return res.status(BAD_REQUEST).json({ error: true, message: "amounts is incorrect" });
  }
  if (payeeId && connectedAccountId) {
    const transactionBytes = await createTopUpTransaction(payeeId, amounts, connectedAccountId);
    return res.status(CREATED).json(transactionBytes);
  }
  return res.status(BAD_REQUEST).json({ error: true, message: "Connect your wallet first." });
}

async function handleCampaignFundAllocation(req: Request, res: Response) {
  const campaignId: number = req.body.campaignId;

  //! get campaignById
  const campaignDetails = await getCampaignDetailsById(campaignId);

  if (campaignDetails && campaignDetails.campaign_budget && campaignDetails.user_user?.hedera_wallet_id && campaignDetails.owner_id) {
    const amounts = Math.round(campaignDetails?.campaign_budget * Math.pow(10, 8));
    const campaignerAccount = campaignDetails.user_user?.hedera_wallet_id;
    const campaignerId = campaignDetails.owner_id;

    //?  call the function to update the balances of the camp
    const { transactionId, receipt } = await allocateBalanceToCampaign(campaignDetails.id, amounts, campaignerAccount);
    await userService.topUp(campaignerId, amounts, "decrement");

    return res.status(CREATED).json({ transactionId, receipt });
  }

  return res.status(NON_AUTHORITATIVE_INFORMATION).json({ error: true, message: "CampaignIs is not correct" });
}

async function handleContractInfoReq(_: Request, res: Response) {
  const info = await getSMInfo();
  if(info)
   return res.status(OK).json(info);
  return res.status(BAD_REQUEST).json({error:true});
}


async function handleReimbursement(req: Request, res: Response) {
  const amount:number = req.body.amount;

  if(!req.currentUser?.user_user.hedera_wallet_id){
    return res.status(BAD_REQUEST).json({error:true , message:"Sorry This request can't be completed."})
  }

  if(!req.currentUser?.user_user.available_budget || (req.currentUser?.user_user.available_budget && req.currentUser?.user_user.available_budget<amount)){
    return res.status(BAD_REQUEST).json({error:true , message:"Insufficient available amount in user's account."})
  }


  const reimbursementTransaction = await reimbursementAmount(req.currentUser.user_id, amount , req.currentUser.user_user.hedera_wallet_id);
  return res.status(OK).json(reimbursementTransaction)
}