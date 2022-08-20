import { Request, Response, Router } from "express";
import { body , validationResult } from "express-validator";
import statusCodes from "http-status-codes";
// import { topUpHandler } from "@controller/transaction.controller";

// Constants
const router = Router();
const { OK, BAD_REQUEST } = statusCodes;
// Paths

router.post("/top-up", body("amount").isFloat(), topUpHandler);

function topUpHandler(req: Request, res: Response) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(BAD_REQUEST).json({ errors: errors.array() });
  }
  res.status(OK).json({ response: "success" });
}

export default router;
