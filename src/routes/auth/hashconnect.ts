import { handleCreateChallenge, handleGenerateAuthAst } from "@controller/Auth";
import auth from "@middleware/auth";
import { checkErrResponse, validateGenerateAstPayload } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body } from "express-validator";

const router = Router();

/**
 * @swagger
 * /auth/hashconnect/create-challange:
 *   get:
 *     summary: Create a challenge
 *     responses:
 *       200:
 *         description: Successfully created challenge
 */
router.get("create-challange", handleCreateChallenge);

/**
 * @swagger
 * /auth/hashconnect/verify-response:
 *   post:
 *     summary: Generate authentication AST
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payload:
 *                 type: string
 *                 description: The payload to generate AST
 *     responses:
 *       200:
 *         description: Successfully generated AST
 */
router.post("verify-response", auth.havingValidPayloadToken, body().custom(validateGenerateAstPayload), checkErrResponse, handleGenerateAuthAst);

export default router;
