import { createChallenge } from "@controller/WalletConnectAuth";
import { Router } from "express";

const router = Router();

router.get("create-challange", createChallenge);

export default router;
