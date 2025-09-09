import express from 'express';
import swaggerDefinition from './config/swaggerDefinition';
import setupSwagger from './swagger';
import logsRouter from '@routes/logs-router';
import apiRouter from '@routes/index';
import authRouter from '@routes/auth-router';
import logger from '../config/logger';

export const setupRoutes = (app: express.Express) => {
  // Protect /api-docs with session-auth redirect
  const redirectToAuthIfNot = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const pReq = req as express.Request & { isAuthenticated?: () => boolean };
    if (pReq.isAuthenticated && pReq.isAuthenticated()) return next();
    logger.info('User not authenticated, redirecting to GitHub auth.');
    res.redirect('/auth/github');
  };

  app.use('/api-docs', redirectToAuthIfNot);
  setupSwagger(app, swaggerDefinition);

  // Logs routes - temporary auth-free access
  app.use('/logs', logsRouter);

  // API routes
  app.use('/api', apiRouter);
  app.use('/auth', authRouter);
};

export default setupRoutes;
