import { Router, Request, Response, NextFunction } from 'express';
import { handleGetLogs, handleGetLogsPage } from '../controller/Logs';
import checkWritePermission from '../middleware/checkWritePermission';

const logsRouter = Router();

// Async wrapper for middleware
const asyncMiddleware = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// UI route for logs page
logsRouter.get('/', asyncMiddleware(checkWritePermission), handleGetLogsPage);

// API route for logs data
logsRouter.get('/api', asyncMiddleware(checkWritePermission), handleGetLogs);

export default logsRouter;
