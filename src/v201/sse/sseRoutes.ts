import { Router } from "express";
import { sseHandler } from "./sseManager";

const router = Router();

router.get("/", sseHandler); // Protected SSE endpoint

export default router;
