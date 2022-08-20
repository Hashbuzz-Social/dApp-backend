import adminMiddleWare from "@middleware/admin";
import { checkWalletFormat } from "@validator/userRoutes.validator";
import { Request, Response, Router } from "express";
import StatusCodes from "http-status-codes";
import JSONBigInt from "json-bigint";
import { sensitizeUserData } from "@shared/helper";

import userService from "@services/user-service";
import { body, validationResult } from "express-validator";

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
router.get(p.get, adminMiddleWare.isAdmin, (_: Request, res: Response) => {
  (async () => {
    const users = await userService.getAll();
    return res.status(OK).json({ users: JSONBigInt.parse(JSONBigInt.stringify(users)) });
  })();
});

/***
 * Update wallet id to for current user.
 **/
router.put(p.update + "/wallet", body("walletId").custom(checkWalletFormat), (req: Request, res: Response) => {
  //check validation and return
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(BAD_REQUEST).json({ errors: errors.array() });
  }

  //If not error then update database
  (async () => {
    const walletId: string = req.body.walletId;
    const id = req.currentUser?.user_id;
    const updatedUser = await userService.updateWalletId(walletId, id!);
    return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(updatedUser))));
  })();
});

export default router;
