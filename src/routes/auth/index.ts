import { Router } from "express";
import passport from "../../server/config/passportSetup"

const router = Router();

router.get("/auth/github", passport.authenticate("github", { scope: ["user:email", "repo"] }));

router.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/non-allowed", failureMessage: true }), // Enhanced error handling
  (req, res) => {
    // console.log("GitHub authentication successful, redirecting to API docs.");
    res.redirect("/api-docs");
  }
);

export default router;