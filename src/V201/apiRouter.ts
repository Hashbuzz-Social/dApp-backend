import { Router } from "express";
import {campaignRouter} from "./Modules";


const router = Router();

// websocket route placeholder: clients should connect directly to the WS server
router.use('/websocket', (_req, res) => res.status(204).send());

router.use('/campaign', campaignRouter);

export default router;