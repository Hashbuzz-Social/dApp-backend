import express, { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import logger from '../config/logger';
import { AppConfig } from '../@types/AppConfig';

type RedisClientLike = { connect?: () => Promise<void> } & Record<string, unknown>;

interface ExtendedApp extends express.Express {
  _redisClient?: RedisClientLike;
}

/**
 * Install session handling middleware. For development, use simplified static configuration.
 * For production, use dynamic per-request session configuration.
 */
export const configureSession = (app: express.Express, config: AppConfig) => {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    // Production: Use dynamic per-request session configuration
    app.use((req: Request, res: Response, next: NextFunction) => {
      const origin = req.get('origin') || req.get('referer') || '';
      const host = req.get('host');

      const isRunningOnDevServer =
        host?.includes('testnet-dev-api.hashbuzz.social') ||
        process.env.SERVER_ENV === 'development' ||
        process.env.SERVER_ENV === 'staging';

      const trustedCrossOrigins = [
        'https://testnet-dev-api.hashbuzz.social',
        'https://dev.hashbuzz.social',
        'https://www.hashbuzz.social',
        'https://hashbuzz.social',
      ];

      const isTrustedCrossOrigin = trustedCrossOrigins.some((trusted) =>
        origin.includes(trusted)
      );

      // Decide session cookie policy
      let sessionConfig: {
        secure: boolean;
        sameSite: 'strict' | 'lax' | 'none';
      };
      if (isRunningOnDevServer) {
        sessionConfig = { secure: true, sameSite: 'none' };
      } else {
        sessionConfig = {
          secure: true,
          sameSite: isTrustedCrossOrigin ? 'none' : 'strict',
        };
      }

      // Debug session configuration
      logger.info('=== Session Configuration Debug ===');
      logger.info('Host: ' + (host || 'none'));
      logger.info('Origin: ' + origin);
      logger.info('isProduction: ' + String(isProduction));
      logger.info('isRunningOnDevServer: ' + String(isRunningOnDevServer));
      logger.info('isTrustedCrossOrigin: ' + String(isTrustedCrossOrigin));
      logger.info('Final sessionConfig: ' + JSON.stringify(sessionConfig));
      logger.info('=====================================');

      const makeSessionOptions = (
        store?: session.Store
      ): session.SessionOptions => ({
        store,
        secret: config.encryptions.sessionSecret,
        name: 'hashbuzz.sid',
        cookie: {
          maxAge: 24 * 60 * 60 * 1000,
          secure: sessionConfig.secure,
          httpOnly: true,
          sameSite: sessionConfig.sameSite,
        },
        resave: false, // Don't save session if unmodified (prevents race conditions)
        saveUninitialized: false, // Don't create session until something stored (security best practice)
        rolling: false, // Don't regenerate session ID on every request (was causing session loss!)
      });

      let sessionMiddleware: express.RequestHandler;

      try {
        // Dynamically require to avoid hard dependency during development
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const connectRedis = require('connect-redis') as unknown as (
          sess: typeof session
        ) => { new (opts: { client: RedisClientLike }): session.Store };
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const redis = require('redis') as unknown as {
          createClient: (opts?: Record<string, unknown>) => RedisClientLike;
        };

        const RedisStore = connectRedis(session) as unknown as {
          new (opts: { client: RedisClientLike }): session.Store;
        };

        const extendedApp = app as ExtendedApp;
        if (!extendedApp._redisClient) {
          extendedApp._redisClient = redis.createClient({
            url: config.db?.redisServerURI ?? process.env.REDIS_URL,
          });
          if (
            extendedApp._redisClient?.connect &&
            typeof extendedApp._redisClient.connect === 'function'
          ) {
            extendedApp._redisClient
              .connect()
              .catch((e: unknown) =>
                logger.err('Redis connect error: ' + String(e))
              );
          }
        }

        const redisClient = extendedApp._redisClient;
        const redisStore = new RedisStore({ client: redisClient });
        sessionMiddleware = session(makeSessionOptions(redisStore));
      } catch (err: unknown) {
        logger.err(
          'Redis session store unavailable, falling back to memory store: ' +
            String(err)
        );
        sessionMiddleware = session(makeSessionOptions());
      }

      sessionMiddleware(req, res, next);
    });
  } else {
    // Development: Use static session configuration (fixes passport integration)
    logger.info('=== Development Session Configuration ===');
    logger.info('Using static session config for development');
    logger.info('sessionConfig: {"secure": false, "sameSite": "lax"}');
    logger.info('==========================================');

    const sessionOptions: session.SessionOptions = {
      secret: config.encryptions.sessionSecret,
      name: 'hashbuzz.sid',
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        secure: false, // HTTP allowed for localhost
        httpOnly: true,
        sameSite: 'lax', // Works with localhost
      },
      resave: false, // Don't save session if unmodified
      saveUninitialized: false, // Don't create session until something stored
      rolling: false, // Don't regenerate session ID on every request
    };

    // Apply static session middleware for development
    app.use(session(sessionOptions));
  }
};

export default configureSession;
