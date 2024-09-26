import { createChallenge, vertifyResponseAndGenrateToekn } from "@controller/WalletConnectAuth";
import { checkErrResponse } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body } from "express-validator";

const router = Router();

router.get("create-challange", createChallenge);
router.post("signed-challange", body().isObject(), checkErrResponse, vertifyResponseAndGenrateToekn);

export default router;
