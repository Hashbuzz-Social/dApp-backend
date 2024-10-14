import authRouter from "@routes/auth";
import apiRouter from "@routes/index";
import { CustomError } from "@shared/errors";
import axios from "axios";
import cookieParser from "cookie-parser";
import cors from "cors";
import crypto from "crypto";
import express, { NextFunction, Request, Response } from "express";
import "express-async-errors";
import rateLimit from "express-rate-limit";
import session from "express-session";
import helmet from "helmet";
import { isHttpError } from "http-errors";
import logger from "jet-logger";
import morgan from "morgan";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import path from "path";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import responseFormatter from "./config/responseFormatter";
import swaggerDefinition from "./config/swaggerDefinition";

// Constants
const app = express();
const GITHUB_REPO = process.env.GITHUB_REPO || "owner/repo"; // Replace with your repo

// Enhanced CORS options to include credentials
const corsOptions: cors.CorsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
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

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 450, // Limit each IP to 450 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
// app.use(limiter);

// Generate a random string for session secret
const generateRandomString = (length: number) => {
  return crypto.randomBytes(length).toString("hex");
};

const sessionSecret = process.env.SESSION_SECRET || generateRandomString(32);

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
      clientID: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL: `${process.env.TWITTER_CALLBACK_HOST ?? "http://localhost:4000"}/auth/github/callback`,
    },
    async (accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any, info?: any) => void) => {
      try {

        // Verify token scopes
        const tokenInfo = await axios.get("https://api.github.com/user", {
          headers: { Authorization: `token ${accessToken}` },
        });
        console.log("Token scopes:", tokenInfo.headers["x-oauth-scopes"]);

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

const options = {
  swaggerDefinition,
  apis: ["./src/routes/**/*.ts"], // Recursively scan all .ts files in routes and subfolders
};
// Initialize swagger-jsdoc
const swaggerSpec = swaggerJsdoc(options);

// Apply session only for Swagger and routes that need authentication
app.use("/api-docs", ensureAuthenticated, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// // Routes setup without session for /api and /auth
app.use("/api", apiRouter);
app.use("/auth", authRouter);

// app.use(apiRoutes)

/**
 * Error handling middleware
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // Check if the error is an HTTP error
  if (isHttpError(err)) {
    console.error("HTTP Error:", err.message); // Logging error details
    logger.err(err, true);
    return res.status(err.status).send({ error: { message: err.message } });
  }

  // Check if the error is a custom error
  if (err instanceof CustomError) {
    console.error("Custom Error:", err.message); // Logging error details
    logger.err(err, true);
    return res.status(err.HttpStatus).send({
      //@ts-ignore
      error: { message: err.message, description: err.description },
    });
  }

  // Log internal server errors
  console.error("Internal Server Error:", err.message); // Logging error details
  logger.err(err, true);
  res.status(500).send({
    error: { message: "Internal Server Error", description: err.message },
  });
});

// Front-end content
const viewsDir = path.join(__dirname, "../views");
app.set("views", viewsDir);

const staticDir = path.join(__dirname, "../public");
app.use(express.static(staticDir));

app.get("*", (_: Request, res: Response) => {
  res.sendFile("index.html", { root: viewsDir });
});

export default app;
