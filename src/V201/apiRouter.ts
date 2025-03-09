import { Router } from "express";
import { sseRoutes } from "./sse";
import {campaignRouter} from "./Modules";


const router = Router();

router.use("/sse",  sseRoutes ); // Protected SSE endpoint

router.use('/campaign', campaignRouter);

export default router;