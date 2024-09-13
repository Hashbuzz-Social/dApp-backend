import { Router } from "express";
import apiRouter from "../index";

const router = Router();
/**
 * @swagger
 * /api:
 *   get:
 *     summary: Entry point for the API server
 *     description: This is the entry point for the API server.
 *     responses:
 *       200:
 *         description: Successful response
 */
router.use("/api", apiRouter);

export default router;
