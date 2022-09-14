import { addCampaigner, provideActiveContract } from "@services/smartcontract-service";
import { createTopUpTransaction, updateBalanceToContract } from "@services/transaction-service";
import userService from "@services/user-service";
import { checkErrResponse, checkWalletFormat } from "@validator/userRoutes.validator";
import { Request, Response, Router } from "express";
import { body } from "express-validator";
import statusCodes from "http-status-codes";
// import { topUpHandler } from "@controller/transaction.controller";

// Constants
const router = Router();
const { OK, CREATED, BAD_REQUEST } = statusCodes;
// Paths

router.post("/create-topup-transaction", body("amounts").isObject(), body("accountId").custom(checkWalletFormat), creteTopUpHandler);
router.post("/top-up", body("amounts").isObject(), body("accountId").custom(checkWalletFormat), checkErrResponse, topUpHandler);
router.post("/addCampaigner", body("walletId").custom(checkWalletFormat), checkErrResponse, addCampaignerHandlers);
router.post("/activeContractId", body("accountId").custom(checkWalletFormat), checkErrResponse, activeContractHandler);
router.post("./allotFundForCampaign" , body("campaignId").isNumeric(), checkErrResponse , handleCampaignFundAllocation  )

//@handlers

//===============================

/****
 *@description top-up handler
 */

async function topUpHandler(req: Request, res: Response) {
  const accountId: string = req.body.accountId;
  const amounts: { topUpAmount: number; fee: number; total: number } = req.body.amounts;

  if (!amounts?.topUpAmount || !amounts.fee || !amounts.total) {
    return res.status(BAD_REQUEST).json({ error: true, message: "amounts is incorrect" });
  }

  if (req.currentUser?.user_id) {
    try {
      const topUp = await userService.topUp(req.currentUser?.user_id, amounts);
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
  const payeeId: string = req.body.accountId;
  const amounts: { topUpAmount: number; fee: number; total: number } = req.body.amounts;

  if (!amounts?.topUpAmount || !amounts.fee || !amounts.total) {
    return res.status(BAD_REQUEST).json({ error: true, message: "amounts is incorrect" });
  }

  const transactionBytes = await createTopUpTransaction(payeeId, amounts);
  return res.status(CREATED).json(transactionBytes);
}


function handleCampaignFundAllocation(req:Request , res:Response) {
  return res.status(CREATED).json({"done":true});
}