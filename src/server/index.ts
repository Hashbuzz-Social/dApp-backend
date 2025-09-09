// axios intentionally not used here; auth module handles GitHub checks
import express from 'express';
import 'express-async-errors';
import '../pre-start'; // Must be the first import
import logger from '../config/logger'; // Use configured logger
import { logRotationService } from '../services/LogRotationService';
import { initializeLogRotation as setupLogRotation } from '../config/logConfig';
import { getConfig } from '@appConfig';
import setupCore from './core';
import setupRoutes from './routes';
import configureGithubAuth, { githubRoutes } from './authGithub';

// Constants
const app = express();

const initializeApp = async () => {
  const config = await getConfig();

  // Setup GitHub strategy (defines passport strategy)
  configureGithubAuth(config);

  // Setup middleware, views and security (this applies session middleware used by passport)
  setupCore(app, config);

  // Mount GitHub OAuth routes (must be after session middleware)
  githubRoutes(app);

  // Register application routes (API, auth, logs, swagger)
  setupRoutes(app);
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
