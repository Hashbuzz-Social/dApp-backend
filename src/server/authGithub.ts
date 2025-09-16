import passport from 'passport';
import axios from 'axios';
import { Strategy as GitHubStrategy, StrategyOptions } from 'passport-github2';
import logger from '../config/logger';
import express from 'express';
import { AppConfig } from '../@types/AppConfig';

interface GitHubProfile extends Express.User {
  username?: string;
  accessToken?: string;
}

type DoneCallback = (err: unknown | null, user?: Express.User | GitHubProfile | false, info?: unknown) => void;

export const configureGithubAuth = (config: AppConfig) => {
  const GITHUB_REPO = config.repo.repo;
  // Determine callbackURL behavior. Only build URL if xCallBackHost provided.
  const callbackHost = config.app.xCallBackHost;
  const callbackURL = callbackHost
    ? `${callbackHost.replace(/\/$/, '')}/auth/github/callback`
    : '';
  logger.info(
    'GitHub OAuth callbackURL configured: ' +
      (callbackURL ?? '(none - using app-registered callback)')
  );

  // Validate required repo client credentials before registering the strategy
  const clientID = config.repo.repoClientID?.toString() ?? '';
  const clientSecret = config.repo.repoClientSecret?.toString() ?? '';
  if (!clientID || !clientSecret) {
    logger.err(
      'GitHub OAuth is not configured: REPO_CLIENT_ID or REPO_CLIENT_SECRET is missing. Skipping GitHub strategy registration.'
    );
    // Do not register the strategy if credentials are missing — routes will return 503 if used.
    return;
  }

  // Build options with correct typing based on callbackURL presence
  const strategyOptions: StrategyOptions = {
    clientID,
    clientSecret,
    callbackURL: callbackURL, // undefined allowed by passport-github2
  };

  passport.use(
    new GitHubStrategy(
      strategyOptions,
      (
        accessToken: string,
        refreshToken: string,
        profile: GitHubProfile,
        done: DoneCallback
      ) => {
        // Use immediately invoked async function with proper error handling
        (async () => {
          try {
            logger.info(
              'GitHub strategy callback called for user: ' +
                (profile.username || 'unknown')
            );

            await axios.get('https://api.github.com/user', {
              headers: { Authorization: `token ${accessToken}` },
            });

            const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/collaborators/${String(
              profile.username
            )}`;
            logger.info('GitHub API URL: ' + apiUrl);

            const response = await axios.get(apiUrl, {
              headers: {
                Authorization: `token ${accessToken}`,
              },
            });

            if (response.status === 204) {
              profile.accessToken = accessToken;
              logger.info(
                'GitHub repository access verified for developer: ' +
                  (profile.username || 'unknown')
              );
              return done(null, profile);
            }
            logger.warn(
              'GitHub repository access denied for developer: ' +
                (profile.username || 'unknown')
            );
            return done(null, false, {
              message:
                'You do not have access to this repository. API documentation is restricted to project collaborators.',
            });
          } catch (error) {
            logger.err('GitHub strategy callback error: ' + String(error));
            if (axios.isAxiosError(error)) {
              logger.err('GitHub API error: ' + String(error.response?.data));
              logger.err(
                'GitHub API status: ' + String(error.response?.status)
              );
            } else {
              logger.err('Unexpected error: ' + String(error));
            }
            return done(null, false, {
              message: 'Error verifying repository access.',
            });
          }
        })().catch((error) => {
          // Catch any errors from the async function itself
          logger.err(
            'Async function error in GitHub strategy: ' + String(error)
          );
          return done(null, false, {
            message: 'Internal authentication error.',
          });
        });
      }
    )
  );

  passport.serializeUser((user: Express.User, done: DoneCallback) => {
    logger.info('=== serializeUser called ===');
    logger.info('User to serialize: ' + JSON.stringify(user, null, 2));
    // Store the entire user object in the session
    done(null, user);
  });

  passport.deserializeUser((id: unknown, done: DoneCallback) => {
    logger.info('=== deserializeUser called ===');
    logger.info('ID to deserialize: ' + JSON.stringify(id, null, 2));
    // The 'id' is actually the entire user object from serializeUser
    done(null, id as Express.User);
  });
};

export const githubRoutes = (app: express.Express) => {
  // Developer authentication routes for /api-docs access only
  // Note: passport.initialize() and passport.session() are now handled globally in core.ts
  const ensureGithubStrategyRegistered = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    try {
      const anyPassport = passport as unknown as Record<string, unknown>;
      const strategyFn =
        anyPassport && typeof anyPassport['_strategy'] === 'function'
          ? (anyPassport['_strategy'] as (name: string) => unknown)
          : undefined;
      const strategy = strategyFn ? strategyFn('github') : undefined;
      if (!strategy) {
        logger.err(
          'GitHub strategy not registered. Ensure REPO_CLIENT_ID and REPO_CLIENT_SECRET are configured.'
        );
        return res
          .status(503)
          .send('GitHub OAuth is not configured on this server.');
      }
    } catch (e) {
      // Fallback: continue to let passport respond with its own error
    }
    return next();
  };

  // Use middleware chain: pre-check then passport middleware
  const githubAuthMiddleware = passport.authenticate('github', {
    scope: ['user:email', 'repo'],
  }) as unknown as express.RequestHandler;
  app.get('/auth/github', ensureGithubStrategyRegistered, githubAuthMiddleware);

  // Callback route: standard middleware chain. We log query params, let passport handle auth,
  // then a success handler will establish session and redirect. Errors from passport (e.g. token
  // exchange failures) will be forwarded to the error handler registered below for this path.
  app.get(
    '/auth/github/callback',
    (
      req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) => {
      try {
        logger.info('GitHub callback query: ' + JSON.stringify(req.query));
      } catch (e) {
        logger.warn('Failed to stringify GitHub callback query');
      }
      return next();
    },
    passport.authenticate('github', {
      failureRedirect: '/non-allowed',
      failureMessage: true,
    }) as unknown as express.RequestHandler,
    (req: express.Request, res: express.Response) => {
      const user = req.user as unknown as { accessToken?: string } | undefined;
      if (user && user.accessToken) {
        (req.session as unknown as Record<string, unknown>).accessToken =
          user.accessToken;
      }

      // Debug logging
      logger.info(
        'GitHub authentication callback - req.user exists: ' +
          String(!!req.user)
      );
      const authReq = req as express.Request & {
        isAuthenticated?: () => boolean;
      };
      logger.info(
        'GitHub authentication callback - req.isAuthenticated exists: ' +
          String(typeof authReq.isAuthenticated === 'function')
      );
      if (authReq.isAuthenticated) {
        logger.info(
          'GitHub authentication callback - req.isAuthenticated(): ' +
            String(authReq.isAuthenticated())
        );
      }

      // Ensure session is saved before redirect
      logger.info('=== OAuth Callback Session Debug ===');
      logger.info('Session ID: ' + req.sessionID);
      logger.info('Session data before save: ' + JSON.stringify(req.session));
      logger.info(
        'Session passport before save: ' +
          JSON.stringify((req.session as any)?.passport || 'NONE')
      );
      logger.info(
        'req.user after passport auth: ' + JSON.stringify(req.user || 'NONE')
      );

      req.session.save((err) => {
        if (err) {
          logger.err('Error saving session: ' + String(err));
          return res.status(500).send('Session save error');
        }

        logger.info('Session data after save: ' + JSON.stringify(req.session));
        logger.info(
          'Session passport after save: ' +
            JSON.stringify((req.session as any)?.passport || 'NONE')
        );

        // Double-check authentication status after session save
        if (authReq.isAuthenticated && authReq.isAuthenticated()) {
          logger.info(
            'GitHub developer authentication successful and verified, redirecting to API docs.'
          );
          return res.redirect('/api-docs');
        } else {
          logger.err(
            'GitHub developer authentication callback succeeded but user is not authenticated after session save'
          );
          return res
            .status(500)
            .send('Developer authentication verification failed');
        }
      });
    }
  );

  // Path-scoped error handler to catch token-exchange and other passport errors for this route
  app.use(
    '/auth/github/callback',
    (err: unknown, req: express.Request, res: express.Response) => {
      logger.err('GitHub authentication error (path-scoped handler):');
      logger.err('Error message: ' + String(err));
      logger.err('Error stack: ' + (err instanceof Error ? err.stack : 'N/A'));
      logger.err('Request query: ' + JSON.stringify(req.query));
      logger.err('Request params: ' + JSON.stringify(req.params));

      // If it's an OAuth token exchange error, surface a helpful message
      return res
        .status(502)
        .send(
          'Failed to obtain access token from GitHub. Check server logs for details.'
        );
    }
  );
};

export default configureGithubAuth;
