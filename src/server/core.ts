import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import lusca from 'lusca';
import morgan from 'morgan';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import logger from '../config/logger';
import { isHttpError } from 'http-errors';
import responseFormatter from './config/responseFormatter';
import configureSession from './session';
import { AppConfig } from '../@types/AppConfig';

export const setupCore = (app: express.Express, config: AppConfig) => {
  // CORS
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
        'www.hashbuzz.social',
        'https://testnet-dev-api.hashbuzz.social',
        'https://dev.hashbuzz.social',
      ].map((domain) => domain.trim());

      // logger.info(`CORS check for origin: ${origin || 'no-origin'}`);

      if (isDevelopment) return callback(null, true);
      if (!origin) return callback(null, true);
      if (whitelist.includes(origin)) return callback(null, true);
      callback(
        new Error(`API blocked by CORS policy. Origin '${origin}' not allowed.`)
      );
    },
    methods: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    credentials: true,
  };

  app.use(cors(corsOptions));

  // Configure express middleware with proper size limits for media uploads
  app.use(express.json({ limit: '10mb' })); // Increase JSON payload limit for media data
  app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Increase URL-encoded payload limit
  app.use(cookieParser());

  // Session
  configureSession(app, config);

  // Initialize Passport middleware (must be after session)
  app.use(passport.initialize());
  app.use(passport.session());

  // Security middleware
  app.use(
    lusca({
      csrf: false,
      xframe: 'SAMEORIGIN',
      xssProtection: true,
      nosniff: true,
      referrerPolicy: 'no-referrer',
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    })
  );

  // CSRF token error handler
  const isCsrfError = (obj: unknown): obj is { code?: string } => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'code' in (obj as Record<string, unknown>)
    );
  };

  // Error handlers for payload size and other common issues
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    // Handle payload too large error
    if (
      err instanceof Error &&
      err.message.includes('request entity too large')
    ) {
      logger.err(`Payload too large: ${req.originalUrl} - ${req.method}`);
      res.status(413).json({
        error: 'Payload too large',
        message:
          'The uploaded file or request body is too large. Maximum allowed size is 10MB.',
        endpoint: req.originalUrl,
      });
      return;
    }

    // Handle CSRF token errors
    if (
      isCsrfError(err) &&
      (err as { code?: string }).code === 'EBADCSRFTOKEN'
    ) {
      logger.err('CSRF Token Mismatch. Resetting session.');
      req.session?.destroy(() => {
        res.status(403).json({ error: 'CSRF token mismatch. Session reset.' });
      });
      return;
    }
    next(err);
  });

  // Send CSRF token cookie when available
  app.use((req: Request, res: Response, next: NextFunction) => {
    const maybeReq = req as Request & { csrfToken?: () => string };
    if (typeof maybeReq.csrfToken === 'function') {
      const token = maybeReq.csrfToken();
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
      helmet.hsts({ maxAge: 31536000, includeSubDomains: true, preload: true })
    );
  }

  // Trust proxy and rate limiting
  app.set('trust proxy', 1);
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      message: 'Too many requests from this IP, please try again later.',
    })
  );

  // Views and static
  const viewsDir = path.join(__dirname, '../views');
  app.set('view engine', 'ejs');
  app.set('views', viewsDir);
  const staticDir = path.join(__dirname, '../../public');
  app.use(express.static(staticDir));

  // Read package.json and serve index view
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')
    );
    // Only render SPA for non-API/static paths. If the request targets API, auth, logs, or assets,
    // call next() so the appropriate routers can handle them (this avoids shadowing /logs etc).
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      const p = req.path || '';
      const skipPrefixes = [
        '/api',
        '/auth',
        '/logs',
        '/api-docs',
        '/favicon.ico',
        '/static',
        '/assets',
        '/uploads',
      ];
      const isAssetLike =
        p.includes('.') ||
        skipPrefixes.some(
          (pre) => p === pre || p.startsWith(pre + '/') || p.startsWith(pre)
        );
      if (isAssetLike) return next();
      res.render('index', {
        root: viewsDir,
        version: packageJson.version,
        appUri: process.env.FRONTEND_URL,
      });
    });
  } catch (err) {
    logger.err('Failed to read package.json for views: ' + String(err));
  }

  // Generic error handler (keep at end of core)
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    void next;

    // Handle custom errors (UnauthorizeError, ParamMissingError, etc.)
    if (err instanceof Error && 'HttpStatus' in err) {
      const customErr = err as Error & { HttpStatus: number };
      const status = customErr.HttpStatus;

      // Only log 500+ errors to reduce noise for expected auth failures
      if (status >= 500) {
        logger.err(
          `[${status}] ${req.method} ${req.path}: ${customErr.message}`
        );
      }
      return res.status(status).json({ error: customErr.message });
    }

    // Handle HTTP errors from http-errors package
    if (isHttpError(err)) {
      // Only log 500+ errors to reduce noise for expected auth failures
      if (err.status >= 500) {
        logger.err(`[${err.status}] ${req.method} ${req.path}: ${err.message}`);
      }
      return res.status(err.status).json({ error: err.message });
    }

    // Handle unexpected errors
    const e = err as Error;
    logger.err(`[500] ${req.method} ${req.path}: ${e.message}`);
    res.status(500).json({
      error: { message: 'Internal Server Error', description: e.message },
    });
  });
};

export default setupCore;
