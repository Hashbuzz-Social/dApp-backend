import adminMiddleWare from "@middleware/admin";
import { checkWalletFormat } from "@validator/userRoutes.validator";
import { Request, Response, Router } from "express";
import StatusCodes from "http-status-codes";
import JSONBigInt from "json-bigint";
import { sensitizeUserData } from "@shared/helper";
import logger from "jet-logger";
 
import userService from "@services/user-service";
import { body, validationResult } from "express-validator";
import { queryBalance } from "@services/smartcontract-service";
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

router.get("/current", (red: Request, res: Response) => {
  (async () => {
    const currentUser = await userService.getUserById(red.currentUser?.user_id);
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

  if (req.currentUser?.user_user.hedera_wallet_id === walletId) {
    return res.status(OK).json({ updated: true, message: "id is same as previous one" });
  }

  //If not error then update database
  (async () => {
    const id = req.currentUser?.user_id;
    const updatedUser = await userService.updateWalletId(walletId, id!);
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
      logger.info(`Contract balance for the ${address} is::::- ${balances?.balances??0}`);
      return res.status(OK).json(balances);
    })();
  } else {
    return res.status(OK).json({ available_budget: req.currentUser?.user_user.available_budget });
  }
});

export default router;
