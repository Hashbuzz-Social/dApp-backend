import { addCampaigner, provideActiveContract, queryBalance } from "@services/smartcontract-service";
import { checkErrResponse, checkWalletFormat } from "@validator/userRoutes.validator";
import { TransactionResponse } from "@hashgraph/sdk";
import userService from "@services/user-service";
import hbarService from "@services/hedera-service";
import { Request, Response, Router } from "express";
import { body, validationResult } from "express-validator";
import statusCodes from "http-status-codes";
import prisma from "@shared/prisma";
import { Prisma } from "@prisma/client";
import { createTopUpTransaction } from "@services/transaction-service";
// import { topUpHandler } from "@controller/transaction.controller";

// Constants
const router = Router();
const { OK, CREATED, BAD_REQUEST } = statusCodes;
// Paths

router.post("/create-topup-transaction", body("amount").isFloat(), body("accountId").custom(checkWalletFormat), creteTopUpHandler);

router.post("/top-up", body("amount").isFloat(), checkErrResponse, topUpHandler);
router.post("/addCampaigner", body("walletId").custom(checkWalletFormat), checkErrResponse, addCampaignerHandlers);
router.post("/activeContractId", body("accountId").custom(checkWalletFormat), checkErrResponse, activeContractHandler);

//@handlers

//===============================

/****
 *@description top-up handler
 */

async function topUpHandler(req: Request, res: Response) {
  const amount: number = req.body.amount;
  if (req.currentUser?.user_id) {
    const topUp = await userService.topUp(req.currentUser?.user_id, amount);
    return res.status(OK).json({ response: "success", available_budget: topUp.available_budget });
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
  const amount: number = req.body.amount;
  const payeeId: string = req.body.accountId;

  const transactionBytes = await createTopUpTransaction(payeeId, amount);
  return res.status(CREATED).json(transactionBytes);
}
