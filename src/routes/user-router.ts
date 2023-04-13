import adminMiddleWare from "@middleware/admin";
import { formatTokenBalancesObject, sensitizeUserData } from "@shared/helper";
import { checkErrResponse, checkWalletFormat } from "@validator/userRoutes.validator";
import { NextFunction, Request, Response, Router } from "express";
import passwordService from "@services/password-service";
import StatusCodes from "http-status-codes";
import logger from "jet-logger";
import JSONBigInt from "json-bigint";

import { totalPendingReward } from "@services/reward-service";
import { queryBalance } from "@services/smartcontract-service";
import userService from "@services/user-service";
import prisma from "@shared/prisma";
import { body, validationResult } from "express-validator";
import { IsStrongPasswordOptions } from "express-validator/src/options";
import { ParamMissingError } from "@shared/errors";

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

const passwordCheck: IsStrongPasswordOptions = {
  minLength: 8,
  minNumbers: 1,
  minLowercase: 1,
  minUppercase: 1,
  minSymbols: 1,
};

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

  // console.log("Update_wallet::", req.currentUser?.hedera_wallet_id);

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

const getBalancesForToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    (async () => {
      const tokenList = await prisma.whiteListedTokens.findMany();
      const userBalancesForTokens = await prisma.user_balances.findMany({
        where: {
          user_id: req.currentUser?.id,
        },
      });
      const balanceData = tokenList.map((token) => {
        const balance_record = userBalancesForTokens.find((b) => b.token_id === token.id);
        return formatTokenBalancesObject(token, balance_record);
      });

      return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(balanceData)));
    })();
  } catch (error) {
    next(error);
  }
};

const updatePassword = (req: Request, res: Response, next: NextFunction) => {
  (async () => {
    try {
      const { password, email }: { password: string; email?: string } = req.body;

      if (!email || !password) {
        throw new ParamMissingError("Email and password is required felid");
      }

      const role = req.currentUser?.role;
      const salt = req.currentUser?.salt;
      const hash = req.currentUser?.hash;

      //!! reset password for newly created admin.
      if (role && ["ADMIN", "SUPER_ADMIN"].includes(role) && !salt && !hash) {
        // create new password key and salt
        const { salt, hash } = passwordService.createPassword(password);
        //!! Save to db.
        const updatedUser = await prisma.user_user.update({
          where: { id: req.currentUser?.id },
          data: {
            salt,
            hash,
            email,
          },
        });
        return res.status(OK).json({ message: "Password created successfully.", user: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(updatedUser))) });
      }

      res.status(BAD_REQUEST).json({ message: "Handler function not found" });
    } catch (err) {
      next(err);
    }
  })();
};

router.put("/update-password", body("email").isEmail(), body("password").isStrongPassword(passwordCheck), checkErrResponse, updatePassword);
router.get("/token-balances", getBalancesForToken);

export default router;

