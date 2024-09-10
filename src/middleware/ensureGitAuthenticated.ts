import { NextFunction, Request, Response } from "express";

const ensureAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  console.log("User not authenticated, redirecting to GitHub auth.");
  res.redirect("/auth/github");
};

export default ensureAuthenticated;