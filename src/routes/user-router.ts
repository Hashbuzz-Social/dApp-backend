import adminMiddleWare from "@middleware/admin";
import { sensitizeUserData } from "@shared/helper";
import { checkWalletFormat } from "@validator/userRoutes.validator";
import { Request, Response, Router } from "express";
import StatusCodes from "http-status-codes";
import logger from "jet-logger";
import JSONBigInt from "json-bigint";

import { queryBalance } from "@services/smartcontract-service";
import userService from "@services/user-service";
import { body, validationResult } from "express-validator";
import { totalPendingReward } from "@services/reward-service";
import prisma from "@shared/prisma";

// Constants
const router = Router();
const { OK, BAD_REQUEST } = StatusCodes;
// Paths
export const p = {
  get: "/all",
  add: "/add",
  update: "/update",
  delete: "/delete/:id",
} as const;

/**
 * Get all users.
 */
router.get("/all", adminMiddleWare.isAdmin, (_: Request, res: Response) => {
  (async () => {
    const users = await userService.getAll();
    return res.status(OK).json({ users: JSONBigInt.parse(JSONBigInt.stringify(users)) });
  })();
});

/****
 * get current user.
 */

router.get("/current", (req: Request, res: Response) => {
  (async () => {
    const currentUser = await userService.getUserById(req.currentUser?.id);
    return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(currentUser!))));
  })();
});

/***
 * Update wallet id to for current user.
 **/
router.put("/update/wallet", body("walletId").custom(checkWalletFormat), (req: Request, res: Response) => {
  //check validation and return
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(BAD_REQUEST).json({ errors: errors.array() });
  }

  const walletId: string = req.body.walletId;

  console.log("Update_wallet::", req.currentUser?.hedera_wallet_id);

  if (req.currentUser?.hedera_wallet_id) {
    return res.status(OK).json({ updated: true, message: "Wallet already added to this account" });
  } else {
    //If not error then update database
    (async () => {
      const id = req.currentUser?.id;
      const updatedUser = await userService.updateWalletId(walletId, id!);
      if (updatedUser) {
        await totalPendingReward(updatedUser.personal_twitter_id!, updatedUser.hedera_wallet_id!);
        return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(updatedUser))));
      }
    })();
  }
});

router.patch("/update-concent", (req: Request, res: Response) => {
  (async () => {
    const { consent } = req.body;
    const updatedUser = await prisma.user_user.update({
      where: { id: req.currentUser?.id },
      data: { consent: consent },
    });
    return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(updatedUser))));
  })();
});

router.post("/get-balances", body("accountId").custom(checkWalletFormat), body("contractBal").isBoolean(), (req: Request, res: Response) => {
  //check validation and return
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(BAD_REQUEST).json({ errors: errors.array() });
  }

  const address: string = req.body.accountId;
  const contractBal: boolean = req.body.contractBal;
  if (contractBal) {
    (async () => {
      const balances = await queryBalance(address);
      if (req.currentUser?.id && balances?.balances) await userService.topUp(req.currentUser?.id, parseInt(balances.balances), "update");
      logger.info(`Contract balance for the ${address} is::::- ${balances?.balances ?? 0}`);
      return res.status(OK).json(balances);
    })();
  } else {
    return res.status(OK).json({ available_budget: req.currentUser?.available_budget });
  }
});

export default router;

