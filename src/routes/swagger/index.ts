import ensureAuthenticated from "@middleware/ensureGitAuthenticated";
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "../../server/config/swaggerSpec";

const router = Router();

router.use("/api-docs", ensureAuthenticated, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

export default router;
