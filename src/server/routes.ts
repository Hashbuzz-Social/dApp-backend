import express from 'express';
import swaggerDefinition from './config/swaggerDefinition';
import setupSwagger from './swagger';
import logsRouter from '@routes/logs-router';
import apiRouter from '@routes/index';
import authRouter from '@routes/auth-router';
import logger from '../config/logger';

export const setupRoutes = (app: express.Express) => {
  // Protect /api-docs with GitHub authentication (for developers only)
  const requireGitHubAuthForDevelopers = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const pReq = req as express.Request & {
      isAuthenticated?: () => boolean;
      session?: any;
      user?: any;
    };

    // Debug session information for /api-docs access
    const sessionData = pReq.session;
    logger.info('=== /api-docs Developer Auth Check ===');
    logger.info(
      `Session ID: ${String(
        (sessionData as Record<string, unknown>)?.id || 'NO_ID'
      )}`
    );
    logger.info(`Session data: ${JSON.stringify(pReq.session || {})}`);
    try {
      const sessionKeys = pReq.session ? Object.keys(pReq.session) : [];
      logger.info(`Raw session keys: ${sessionKeys.join(', ')}`);
      logger.info(
        `Session passport key: ${JSON.stringify(
          pReq.session?.passport || 'NONE'
        )}`
      );
    } catch (e) {
      logger.info(`Session key inspection failed: ${String(e)}`);
    }
    logger.info(
      `isAuthenticated function exists: ${String(
        typeof pReq.isAuthenticated === 'function'
      )}`
    );
    logger.info(`Session exists: ${String(!!pReq.session)}`);
    logger.info(`User exists: ${String(!!pReq.user)}`);
    logger.info(`User data: ${JSON.stringify(pReq.user || 'NONE')}`);

    if (pReq.isAuthenticated && pReq.isAuthenticated()) {
      logger.info(
        'Developer authenticated via GitHub, allowing API docs access'
      );
      return next();
    }
    logger.info(
      'Developer not authenticated, redirecting to GitHub OAuth for API docs access'
    );
    res.redirect('/auth/github');
  };

  // Apply GitHub authentication only to /api-docs route
  app.use('/api-docs', requireGitHubAuthForDevelopers);
  setupSwagger(app, swaggerDefinition);

  // Route used as failureRedirect target from GitHub OAuth when developer is not allowed.
  app.get('/non-allowed', (req: express.Request, res: express.Response) => {
    res
      .status(403)
      .send(
        'Developer access denied: Your GitHub account does not have access to this repository. API documentation is restricted to project collaborators.'
      );
  });

  // Logs routes - temporary auth-free access
  app.use('/logs', logsRouter);

  // API routes
  app.use('/api', apiRouter);
  app.use('/auth', authRouter);
};

export default setupRoutes;
