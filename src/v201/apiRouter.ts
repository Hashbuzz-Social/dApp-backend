import { Router } from "express";
import { sseRoutes } from "./sse";
import {campaignRouter , campaignStatsRouters} from "./modules";


const router = Router();

router.use("/sse",  sseRoutes ); // Protected SSE endpoint

router.use('/campaigns', campaignRouter);
router.use('/campaignStats', campaignStatsRouters);

export default router;