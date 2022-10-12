import twitterCardService from "@services/twitterCard-service";
import { Request, Response, Router } from "express";
import { query } from "express-validator";
import statuses from "http-status-codes";
import JSONBigInt from "json-bigint";

const router = Router();
const { OK } = statuses;

const cardTypes = ["Pending", "Completed", "Running"];

router.get("/twitter-card", query("status").isIn(cardTypes), getAllCard);

function getAllCard(req: Request, res: Response) {
  (async () => {
    const status = req.query.status as any as string;
    const data = await twitterCardService.getAllTwitterCardByStatus(status);
    if (data && data.length > 0) {
      return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(data)));
    } else res.status(OK).json([]);
  })();
}

export default router;
