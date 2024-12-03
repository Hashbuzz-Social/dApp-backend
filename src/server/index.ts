import authRouter from "@routes/auth-router";
import apiRouter from "@routes/index";
import axios from "axios";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import "express-async-errors";
import rateLimit from "express-rate-limit";
import session from "express-session";
import fs from 'fs';
import helmet from "helmet";
import { isHttpError } from "http-errors";
import logger from "jet-logger";
import morgan from "morgan";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import path from "path";
import { getConfig } from "src/appConfig";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import responseFormatter from "./config/responseFormatter";
import swaggerDefinition from "./config/swaggerDefinition";

// Constants
const app = express();

const initializeApp = async () => {
  const config = await getConfig();
  const GITHUB_REPO = config.repo.repo;

  // Enhanced CORS options to include credentials
  const corsOptions: cors.CorsOptions = {
    origin: "*",
    methods: "GET, OPTIONS, POST, PUT, PATCH",
    credentials: true, // Allow credentials (cookies) to be sent
  };

  // Middleware setup
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(responseFormatter);

  if (process.env.NODE_ENV === "development") {
    app.use(morgan("dev"));
  }

  if (process.env.NODE_ENV === "production") {
    app.use(helmet());
    app.use(
      helmet.contentSecurityPolicy({
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      })
    );
    app.use(
      helmet.hsts({
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      })
    );
  }

  // Trust the first proxy
  app.set('trust proxy', 1);

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // Limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later.",
  });
  app.use(limiter);

  const sessionSecret = config.encryptions.sessionSecreat;

  // Session setup
  const swaggerSession = session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production" }, // Secure cookies in production
  });

  app.use(swaggerSession); // Apply session middleware globally

  // Enhanced Passport GitHub Strategy with logging
  passport.use(
    new GitHubStrategy(
      {
        clientID: config.repo.repoClientID,
        clientSecret: config.repo.repoClientSecret,
        callbackURL: `${config.app.xCallBackHost ?? "http://localhost:4000"}/auth/github/callback`,
      },
      async (accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any, info?: any) => void) => {
        try {

          // Verify token scopes
          const tokenInfo = await axios.get("https://api.github.com/user", {
            headers: { Authorization: `token ${accessToken}` },
          });

          // Construct the API URL
          const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/collaborators/${profile.username}`;
          console.log("GitHub API URL:", apiUrl);

          // Verify if the user has access to the specified repository
          const response = await axios.get(apiUrl, {
            headers: {
              Authorization: `token ${accessToken}`,
            },
          });

          if (response.status === 204) {
            console.log("User has access to the repository.");
            return done(null, profile);
          } else {
            console.log("User does not have access to the repository.");
            return done(null, false, { message: "You do not have access to this repository." });
          }
        } catch (error) {
          if (axios.isAxiosError(error)) {
            console.error("GitHub API error:", error.response?.data);
          } else {
            console.error("Unexpected error:", error);
          }
          return done(null, false, { message: "Error verifying repository access." });
        }
      }
    )
  );

  passport.serializeUser((user: Express.User, done: (err: any, id?: any) => void) => {
    done(null, user);
  });

  passport.deserializeUser((obj: any, done: (err: any, user?: any) => void) => {
    done(null, obj);
  });

  app.use(passport.initialize());
  app.use(passport.session()); // Apply passport session middleware

  // GitHub OAuth Routes
  app.get("/auth/github", passport.authenticate("github", { scope: ["user:email", "repo"] }));

  app.get(
    "/auth/github/callback",
    passport.authenticate("github", { failureRedirect: "/non-allowed", failureMessage: true }), // Enhanced error handling
    (req, res) => {
      console.log("GitHub authentication successful, redirecting to API docs.");
      res.redirect("/api-docs");
    }
  );

  // Middleware to check if user is authenticated
  const ensureAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) {
      return next();
    }
    console.log("User not authenticated, redirecting to GitHub auth.");
    res.redirect("/auth/github");
  };

  // Options for the swagger docs
  const options = {
    swaggerDefinition: swaggerDefinition(config.app.xCallBackHost),
    apis: ["./src/routes/*.ts"], // Path to the API docs
  };

  // Initialize swagger-jsdoc
  const swaggerSpec = swaggerJsdoc(options);

  // Apply session only for Swagger and routes that need authentication
  app.use("/api-docs", ensureAuthenticated, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Routes setup without session for /api and /auth
  app.use("/api", apiRouter);
  app.use("/auth", authRouter);

  /**
   * Error handling middleware
   */
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (isHttpError(err)) {
      return res.status(err.status).send({ error: err });
    }

    console.error("Internal Server Error:", err.message); // Logging error details
    res.status(500).send({
      error: { message: "Internal Server Error", description: err.message },
    });

    logger.err(err, true);
    next(err);
  });

  // Front-end content
  const viewsDir = path.join(__dirname, "../views");
  app.set('view engine', 'ejs');
  app.set("views", viewsDir);

  const staticDir = path.join(__dirname, "../public");
  app.use(express.static(staticDir));

  // Read package.json
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));

  app.get("*", (_: Request, res: Response) => {
    res.render("index", { root: viewsDir, version: packageJson.version, appUri: process.env.FRONTEND_URL });
  });
};

initializeApp();

export default app;
