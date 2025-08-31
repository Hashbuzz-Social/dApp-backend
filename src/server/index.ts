import authRouter from '@routes/auth-router';
import apiRouter from '@routes/index';
import logsRouter from '@routes/logs-router';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import 'express-async-errors';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import lusca from 'lusca';
import fs from 'fs';
import helmet from 'helmet';
import { isHttpError } from 'http-errors';
import '../pre-start'; // Must be the first import
import logger from '../config/logger'; // Use configured logger
import { logRotationService } from '../services/LogRotationService';
import { initializeLogRotation as setupLogRotation } from '../config/logConfig';
import morgan from 'morgan';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import path from 'path';
import { getConfig } from '@appConfig';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import responseFormatter from './config/responseFormatter';
import swaggerDefinition from './config/swaggerDefinition';

// Constants
const app = express();

const initializeApp = async () => {
  const config = await getConfig();
  const GITHUB_REPO = config.repo.repo;

  // Enhanced CORS options to include credentials
  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      const envDomains = config.app.whitelistedDomains || [];
      const isDevelopment = process.env.NODE_ENV === 'development';
      const whitelist = [
        ...envDomains,
        'http://localhost:3000',
        'http://localhost:3001',
        'https://www.hashbuzz.social',
        'https://hashbuzz.social',
        'www.hashbuzz.social'
      ].map(domain => domain.trim());

      logger.info(`CORS check for origin: ${origin || 'no-origin'}`);
      logger.info(`Whitelisted domains: ${whitelist.join(', ')}`);

      // Allow all origins in development
      if (isDevelopment) {
        logger.info('Development mode - allowing all origins');
        return callback(null, true);
      }

      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        logger.info('Request with no origin - allowing');
        return callback(null, true);
      }

      if (whitelist.includes(origin)) {
        logger.info(`Origin ${origin} is whitelisted - allowing`);
        callback(null, true);
      } else {
        logger.warn(`Origin ${origin} is not whitelisted - blocking`);
        callback(new Error(`API blocked by CORS policy. Origin '${origin}' not allowed.`));
      }
    },
    methods: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    credentials: true,
  };

  // Middleware setup
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(
    session({
      secret: config.encryptions.sessionSecret,
      cookie: { maxAge: 60000, secure: process.env.NODE_ENV === 'production' },
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use(
    lusca({
      csrf: false,
      xframe: 'SAMEORIGIN',
      xssProtection: true,
      nosniff: true, // Prevent MIME type sniffing
      referrerPolicy: 'no-referrer', // Control the referrer information
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }, // HTTP Strict Transport Security
    })
  );

  // Error handling for CSRF token mismatch
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err && err.code === 'EBADCSRFTOKEN') {
      logger.err('CSRF Token Mismatch. Resetting session.');
      req.session?.destroy(() => {
        res.status(403).json({ error: 'CSRF token mismatch. Session reset.' });
      });
    } else {
      next(err);
    }
  });

  // Middleware to send CSRF token to React frontend
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.csrfToken) {
      const token = req.csrfToken();
      res.cookie('XSRF-TOKEN', token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
      });
    }
    next();
  });

  app.use(responseFormatter);

  if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  }

  if (process.env.NODE_ENV === 'production') {
    // Security middleware with custom CSP
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
          },
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
    message: 'Too many requests from this IP, please try again later.',
  });
  app.use(limiter);

  const sessionSecret = config.encryptions.sessionSecret;

  // Session setup
  const swaggerSession = session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }, // Secure cookies in production
  });

  app.use(swaggerSession); // Apply session middleware globally

  // Enhanced Passport GitHub Strategy with logging
  passport.use(
    new GitHubStrategy(
      {
        clientID: config.repo.repoClientID,
        clientSecret: config.repo.repoClientSecret,
        callbackURL: `${
          config.app.xCallBackHost ?? 'http://localhost:4000'
        }/auth/github/callback`,
      },
      (
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: (error: any, user?: any, info?: any) => void
      ) => {
        // Make the function async
        (async () => {
          try {
            // Verify token scopes
            await axios.get('https://api.github.com/user', {
              headers: { Authorization: `token ${accessToken}` },
            });

            // Construct the API URL
            const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/collaborators/${String(profile.username)}`;
            logger.info('GitHub API URL: ' + apiUrl);

            // Verify if the user has access to the specified repository
            const response = await axios.get(apiUrl, {
              headers: {
                Authorization: `token ${accessToken}`,
              },
            });

            if (response.status === 204) {
              logger.info('User has access to the repository.');
              // Store access token in the profile for later use
              profile.accessToken = accessToken;
              return done(null, profile);
            } else {
              logger.info('User does not have access to the repository.');
              return done(null, false, {
                message: 'You do not have access to this repository.',
              });
            }
          } catch (error) {
            if (axios.isAxiosError(error)) {
              logger.err('GitHub API error: ' + String(error.response?.data));
            } else {
              logger.err('Unexpected error: ' + String(error));
            }
            return done(null, false, {
              message: 'Error verifying repository access.',
            });
          }
        })();
      }
    )
  );

  passport.serializeUser(
    (user: Express.User, done: (err: any, id?: any) => void) => {
      done(null, user);
    }
  );

  passport.deserializeUser((obj: any, done: (err: any, user?: any) => void) => {
    done(null, obj);
  });

  app.use(passport.initialize());
  app.use(passport.session()); // Apply passport session middleware

  // GitHub OAuth Routes
  app.get(
    '/auth/github',
    passport.authenticate('github', { scope: ['user:email', 'repo'] }) as express.RequestHandler
  );

  app.get(
    '/auth/github/callback',
    passport.authenticate('github', {
      failureRedirect: '/non-allowed',
      failureMessage: true,
    }) as express.RequestHandler, // Enhanced error handling
    (req: Request, res: Response) => {
      // Store access token in session for later use
      if (req.user && (req.user as any).accessToken) {
        (req.session as any).accessToken = (req.user as any).accessToken;
      }
      logger.info('GitHub authentication successful, redirecting to API docs.');
      res.redirect('/api-docs');
    }
  );

  // Middleware to check if user is authenticated
  const ensureAuthenticated = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (req.isAuthenticated()) {
      return next();
    }
    logger.info('User not authenticated, redirecting to GitHub auth.');
    res.redirect('/auth/github');
  };

  // Options for the swagger docs
  const options = {
    swaggerDefinition: swaggerDefinition(config.app.xCallBackHost),
    apis: ['./src/routes/*.ts'], // Path to the API docs
  };

  // Initialize swagger-jsdoc
  const swaggerSpec = swaggerJsdoc(options);

  // Apply session only for Swagger and routes that need authentication
  app.use(
    '/api-docs',
    ensureAuthenticated,
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec)
  );

  // Logs routes - temporary auth-free access (will be replaced with Hedera wallet + WalletConnect auth later)
  app.use('/logs', logsRouter);

  // Routes setup without session for /api and /auth
  app.use('/api', apiRouter);
  app.use('/auth', authRouter);

  /**
   * Error handling middleware - next parameter required by Express even if unused
   */
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    // Mark next as used to satisfy linting
    void next;
    
    if (isHttpError(err)) {
      return res.status(err.status).json({ error: err.message });
    }

    logger.err('Internal Server Error: ' + err.message);
    res.status(500).json({
      error: { message: 'Internal Server Error', description: err.message },
    });
    // Do not call next(err) here to prevent server crash and duplicate responses
  });

  // Front-end content
  const viewsDir = path.join(__dirname, '../views');
  app.set('view engine', 'ejs');
  app.set('views', viewsDir);

  const staticDir = path.join(__dirname, '../../public');
  app.use(express.static(staticDir));

  // Read package.json
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')
  );

  app.get('*', (_: Request, res: Response) => {
    res.render('index', {
      root: viewsDir,
      version: packageJson.version,
      appUri: process.env.FRONTEND_URL,
    });
  });
};

// Initialize log rotation
const initializeLogRotation = () => {
  // Use the setup function from config
  setupLogRotation();
  
  // Schedule periodic log rotation checks every hour
  setInterval(() => {
    try {
      logRotationService.rotateIfNeeded();
      logRotationService.cleanup(); // Clean up old files beyond retention
    } catch (error) {
      logger.err(`Log rotation error: ${String(error)}`);
    }
  }, 60 * 60 * 1000); // 1 hour

  logger.info('Log rotation service initialized');
};

initializeApp();
initializeLogRotation();

export default app;
