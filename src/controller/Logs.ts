import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import logger from '../config/logger';
import { logRotationService } from '../services/LogRotationService';

// Helper function to parse a single log entry
const parseLogEntry = (logLine: string): any => {
  try {
    // Try to parse as JSON first (in case logs are in JSON format)
    return JSON.parse(logLine);
  } catch {
    // Parse the jet-logger format: [2025-08-24T09:04:07.533Z] INFO: message
    const match = logLine.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]\s+(\w+):\s+(.+)$/);
    if (match) {
      return {
        timestamp: new Date(match[1]),
        level: match[2],
        message: match[3]
      };
    }
    // Fallback for any unmatched lines
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
    
    // Use log rotation service to get available log files
    const logFiles = logRotationService.getLogFiles();

    // Read from all available log files (within 7-day limit)
    let allLogs: any[] = [];
    for (const logFile of logFiles) {
      if (fs.existsSync(logFile)) {
        try {
          const content = fs.readFileSync(logFile, 'utf-8');
          const fileLogs = parseLogEntries(content);
          allLogs = allLogs.concat(fileLogs);
        } catch (fileError) {
          logger.err(`Error reading log file ${logFile}: ${String(fileError)}`);
        }
      }
    }

    if (allLogs.length === 0) {
      res.json({
        success: false,
        message: 'No log files found',
        data: [],
        pagination: {
          page: 1,
          limit: 100,
          total: 0,
          totalPages: 0
        },
        filters: {
          timeRange,
          level,
          search,
          startDate,
          endDate
        }
      });
      return;
    }

    // Sort logs by timestamp (newest first)
    allLogs.sort((a, b) => {
      const timeA = a.timestamp ? new Date(String(a.timestamp)).getTime() : 0;
      const timeB = b.timestamp ? new Date(String(b.timestamp)).getTime() : 0;
      return timeB - timeA;
    });

    // Filter by time range
    const customStart = startDate ? new Date(startDate as string) : undefined;
    const customEnd = endDate ? new Date(endDate as string) : undefined;
    let logs = filterLogsByTimeRange(allLogs, timeRange as string, customStart, customEnd);

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

/**
 * Render the logs page
 */
export const handleGetLogsPage = (req: Request, res: Response, next: NextFunction): void => {
  try {
    res.render('logs', { 
      title: 'System Logs',
      timeRanges: [
        { value: '30min', label: 'Last 30 Minutes' },
        { value: '1hour', label: 'Last Hour' },
        { value: 'today', label: 'Today' },
        { value: '7days', label: 'Last 7 Days' },
        { value: 'custom', label: 'Custom Range' }
      ]
    });
  } catch (error) {
    logger.err(error as Error);
    next(error);
  }
};

/**
 * Get log statistics and rotation information
 */
export const getLogStats = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const stats = logRotationService.getLogStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        rotation: {
          maxLogSize: '10MB',
          maxLogFiles: 7,
          retentionDays: 7
        }
      }
    });
  } catch (error) {
    logger.err(error as Error);
    next(error);
  }
};

/**
 * Manually trigger log rotation
 */
export const rotateLogsManually = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const rotated = logRotationService.rotate();
    
    res.json({
      success: true,
      data: {
        rotated,
        message: rotated ? 'Log rotation completed successfully' : 'No rotation needed or rotation failed'
      }
    });
  } catch (error) {
    logger.err(error as Error);
    next(error);
  }
};
