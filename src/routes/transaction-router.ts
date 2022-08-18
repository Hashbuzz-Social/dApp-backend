import { Request, Response, Router } from "express";
import statusCodes from "http-status-codes";
// import { topUpHandler } from "@controller/transaction.controller";

// Constants
const router = Router();
const { OK } = statusCodes;
// Paths
export const p = {
  topUp: "/top-up",
} as const;

router.post(p.topUp, topUpHandler);

function topUpHandler(req: Request, res: Response) {
  res.status(OK).json({ response: "success" });
}

export default router;
