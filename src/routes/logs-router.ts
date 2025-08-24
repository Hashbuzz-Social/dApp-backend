import { Router } from 'express';
import { handleGetLogs, handleGetLogsPage, getLogStats, rotateLogsManually } from '../controller/Logs';

const logsRouter = Router();

// UI route for logs page - temporary auth-free access
logsRouter.get('/', handleGetLogsPage);

// API route for logs data - temporary auth-free access  
logsRouter.get('/api', handleGetLogs);

// Log management routes - temporary auth-free access
logsRouter.get('/stats', getLogStats);
logsRouter.post('/rotate', rotateLogsManually);

export default logsRouter;
