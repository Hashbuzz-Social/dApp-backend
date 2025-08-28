import path from 'path';
import fs from 'fs';
import { LoggerModes } from 'jet-logger';

// Logger configuration constants
const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'jet-logger.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 7; // Keep 7 days of logs

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Rotates log files when the current log exceeds the maximum size
 * Renames jet-logger.log to jet-logger.log.1, jet-logger.log.1 to jet-logger.log.2, etc.
 * Removes the oldest log file if it exceeds MAX_LOG_FILES
 */
function rotateLogFiles(): void {
  try {
    // Check if current log file exists and is too large
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size >= MAX_LOG_SIZE) {
        // Remove the oldest log file if it exists
        const oldestLogFile = path.join(LOG_DIR, `jet-logger.log.${MAX_LOG_FILES}`);
        if (fs.existsSync(oldestLogFile)) {
          fs.unlinkSync(oldestLogFile);
        }

        // Rotate existing log files
        for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
          const currentFile = path.join(LOG_DIR, `jet-logger.log.${i}`);
          const nextFile = path.join(LOG_DIR, `jet-logger.log.${i + 1}`);
          
          if (fs.existsSync(currentFile)) {
            fs.renameSync(currentFile, nextFile);
          }
        }

        // Move current log to .1
        const firstRotatedFile = path.join(LOG_DIR, 'jet-logger.log.1');
        fs.renameSync(LOG_FILE, firstRotatedFile);
      }
    }
  } catch (error) {
    // Use process.stderr to avoid console lint error
    process.stderr.write(`Error rotating log files: ${String(error)}\n`);
  }
}

/**
 * Setup logger with proper environment configuration
 * This must be called before importing the default logger elsewhere
 */
function setupLogger(): void {
  // Configure logger environment variables before importing jet-logger
  process.env.JET_LOGGER_MODE = LoggerModes.File;
  process.env.JET_LOGGER_FILEPATH = LOG_FILE;
  process.env.JET_LOGGER_FILEPATH_DATETIME = 'FALSE'; // We handle rotation manually
  process.env.JET_LOGGER_TIMESTAMP = 'TRUE';
  process.env.JET_LOGGER_FORMAT = 'LINE';
}

// Setup logger configuration before using it
setupLogger();

// Import the default logger after configuration
import logger from 'jet-logger';

// Schedule periodic log rotation check (every hour)
setInterval(() => {
  try {
    rotateLogFiles();
  } catch (error) {
    // Use process.stderr to avoid console lint error
    process.stderr.write(`Scheduled log rotation failed: ${String(error)}\n`);
  }
}, 60 * 60 * 1000); // 1 hour

export default logger;

// Export utilities for log management
export { LOG_DIR, LOG_FILE, MAX_LOG_FILES, rotateLogFiles };
