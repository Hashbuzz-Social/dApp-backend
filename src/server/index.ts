import apiRouter from "@routes/api";
import authRouter from "@routes/auth";
import swaggerRouter from "@routes/swagger";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Request, Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import corsOptions from "./config/corsOptions";
import errorHandler from "./config/errorHandler";
import passportConfig from "./config/passportSetup";
import limiter from "./config/rateLimit";
import sessionConfig from "./config/sessionConfig";

// Constants
const app = express();

// Middleware setup
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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
app.use(limiter);

// Session setup
app.use(sessionConfig);

// Passport setup
app.use(passportConfig.initialize());
app.use(passportConfig.session()); // Apply passport session middleware

// Routes setup
app.use(apiRouter);
app.use(authRouter);
app.use(swaggerRouter);

/**
 * Error handling middleware
 */
app.use(errorHandler);

// Front-end content
const viewsDir = path.join(__dirname, "views");
app.set("views", viewsDir);

const staticDir = path.join(__dirname, "public");
app.use(express.static(staticDir));

app.get("*", (_: Request, res: Response) => {
  res.sendFile("index.html", { root: viewsDir });
});

export default app;
