import { addCampaigner, provideActiveContract } from "@services/smartcontract-service";
import { checkErrResponse, checkWalletFormat } from "@validator/userRoutes.validator";
import { TransactionResponse } from "@hashgraph/sdk";
import { Request, Response, Router } from "express";
import { body } from "express-validator";
import statusCodes from "http-status-codes";
// import { topUpHandler } from "@controller/transaction.controller";

// Constants
const router = Router();
const { OK, CREATED } = statusCodes;
// Paths

router.post(
  "/top-up",
  body("amount").isFloat(),
  body("type").isString(),
  body("transactionId").isString(),
  body("response").isJSON(),
  checkErrResponse,
  topUpHandler
);
router.post("/addCampaigner", body("walletId").custom(checkWalletFormat), checkErrResponse, addCampaignerHandlers);
router.post("/activeContractId", body("accountId").custom(checkWalletFormat), checkErrResponse, activeContractHandler);

//@handlers

function topUpHandler(req: Request, res: Response) {
  return res.status(OK).json({ response: "success" });
}

export default router;

/*****
 * @description Add campaign to smart contract handler.
 **/
async function addCampaignerHandlers(req: Request, res: Response) {
  const walletId: string = req.body.walletId;

  const addWalletAddressToCampaign = await addCampaigner(walletId, req.currentUser?.user_id);
  return res.status(CREATED).json(addWalletAddressToCampaign);
}

/****
 *
 *@description Check active contract and return to the user.
 */

async function activeContractHandler(req: Request, res: Response) {
  const activeContract = await provideActiveContract();

  return res.status(OK).json(activeContract);
}
