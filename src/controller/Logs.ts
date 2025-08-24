import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import logger from 'jet-logger';

// Helper function to parse a single log entry
const parseLogEntry = (logLine: string): any => {
  try {
    return JSON.parse(logLine);
  } catch {
    const match = logLine.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+(\w+)\s+(.+)/);
    if (match) {
      return {
        timestamp: new Date(match[1]),
        level: match[2],
        message: match[3]
      };
    }
    return {
      timestamp: new Date(),
      level: 'INFO',
      message: logLine
    };
  }
};

// Helper function to parse all log entries
const parseLogEntries = (content: string): any[] => {
  const lines = content.split('\n').filter(line => line.trim() !== '');
  return lines.map(parseLogEntry);
};

// Helper function to filter logs by time range
const filterLogsByTimeRange = (logs: any[], timeRange: string, customStart?: Date, customEnd?: Date): any[] => {
  const now = new Date();
  let startTime: Date;
  let endTime: Date = now;

  switch (timeRange) {
    case 'last30min':
      startTime = new Date(now.getTime() - 30 * 60 * 1000);
      break;
    case 'lastHour':
      startTime = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case 'today':
      startTime = new Date();
      startTime.setHours(0, 0, 0, 0);
      break;
    case 'last7days':
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'custom':
      if (customStart && customEnd) {
        startTime = customStart;
        endTime = customEnd;
      } else {
        throw new Error('Custom date range requires start and end dates');
      }
      break;
    default:
      startTime = new Date(now.getTime() - 60 * 60 * 1000);
  }

  return logs.filter(log => log.timestamp >= startTime && log.timestamp <= endTime);
};

export const handleGetLogs = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { 
      timeRange = 'today', 
      level, 
      search, 
      page = '1', 
      limit = '100', 
      startDate, 
      endDate 
    } = req.query;
    
    const logFilePath = path.join(process.cwd(), 'logs', 'jet-logger.log');

    if (!fs.existsSync(logFilePath)) {
      res.status(404).json({
        success: false,
        message: 'Log file not found',
        data: []
      });
      return;
    }

    const logContent = fs.readFileSync(logFilePath, 'utf-8');
    let logs = parseLogEntries(logContent);

    // Filter by time range
    const customStart = startDate ? new Date(startDate as string) : undefined;
    const customEnd = endDate ? new Date(endDate as string) : undefined;
    logs = filterLogsByTimeRange(logs, timeRange as string, customStart, customEnd);

    // Filter by level if provided
    if (level && typeof level === 'string') {
      logs = logs.filter((log: any) => log.level === level);
    }

    // Filter by search if provided
    if (search && typeof search === 'string') {
      logs = logs.filter((log: any) => {
        const message = log.message;
        return message && typeof message === 'string' && 
               message.toLowerCase().includes(search.toLowerCase());
      });
    }

    // Pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 100;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedLogs = logs.slice(startIndex, startIndex + limitNum);

    res.json({
      success: true,
      data: paginatedLogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: logs.length,
        totalPages: Math.ceil(logs.length / limitNum)
      },
      filters: {
        timeRange,
        level,
        search,
        startDate,
        endDate
      }
    });
  } catch (error) {
    logger.err(error as Error);
    next(error);
  }
};

export const handleGetLogsPage = (req: Request, res: Response, next: NextFunction): void => {
  try {
    res.render('logs');
  } catch (error) {
    logger.err(error as Error);
    next(error);
  }
};
