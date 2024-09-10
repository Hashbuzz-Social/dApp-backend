import ensureAuthenticated from "@middleware/ensureGitAuthenticated";
import { Router } from "express";
import swaggerSpec from "src/server/config/swaggerSpec";
import swaggerUi from "swagger-ui-express";

const router = Router();

if (process.env.NODE_ENV === "production") {
  router.use("/api-docs", ensureAuthenticated, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
} else {
  router.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

export default router;