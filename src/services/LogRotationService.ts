import fs from 'fs';
import path from 'path';

// Configuration
const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'jet-logger.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 7; // Keep 7 days of logs

/**
 * Log Rotation Service
 * Handles automatic log file rotation based on size and age
 */
export class LogRotationService {
  private readonly logDir: string;
  private readonly logFile: string;
  private readonly maxLogSize: number;
  private readonly maxLogFiles: number;

  constructor(
    logDir = LOG_DIR,
    logFile = LOG_FILE,
    maxLogSize = MAX_LOG_SIZE,
    maxLogFiles = MAX_LOG_FILES
  ) {
    this.logDir = logDir;
    this.logFile = logFile;
    this.maxLogSize = maxLogSize;
    this.maxLogFiles = maxLogFiles;

    // Ensure logs directory exists
    this.ensureLogDirectory();
  }

  /**
   * Ensure the logs directory exists
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Check if log rotation is needed based on file size
   */
  public shouldRotate(): boolean {
    try {
      if (!fs.existsSync(this.logFile)) {
        return false;
      }

      const stats = fs.statSync(this.logFile);
      return stats.size >= this.maxLogSize;
    } catch (error) {
      process.stderr.write(`Error checking log file size: ${String(error)}\n`);
      return false;
    }
  }

  /**
   * Rotate log files
   * Moves current log to .1, .1 to .2, etc.
   * Removes the oldest log file if it exceeds maxLogFiles
   */
  public rotate(): boolean {
    try {
      if (!fs.existsSync(this.logFile)) {
        return false;
      }

      // Remove the oldest log file if it exists
      const oldestLogFile = path.join(this.logDir, `jet-logger.log.${this.maxLogFiles}`);
      if (fs.existsSync(oldestLogFile)) {
        fs.unlinkSync(oldestLogFile);
      }

      // Rotate existing log files
      for (let i = this.maxLogFiles - 1; i >= 1; i--) {
        const currentFile = path.join(this.logDir, `jet-logger.log.${i}`);
        const nextFile = path.join(this.logDir, `jet-logger.log.${i + 1}`);
        
        if (fs.existsSync(currentFile)) {
          fs.renameSync(currentFile, nextFile);
        }
      }

      // Move current log to .1
      const firstRotatedFile = path.join(this.logDir, 'jet-logger.log.1');
      fs.renameSync(this.logFile, firstRotatedFile);

      return true;
    } catch (error) {
      process.stderr.write(`Error rotating log files: ${String(error)}\n`);
      return false;
    }
  }

  /**
   * Perform log rotation if needed
   */
  public rotateIfNeeded(): boolean {
    if (this.shouldRotate()) {
      return this.rotate();
    }
    return false;
  }

  /**
   * Clean up old log files beyond the retention period
   */
  public cleanup(): void {
    try {
      for (let i = this.maxLogFiles + 1; i <= this.maxLogFiles + 10; i++) {
        const oldLogFile = path.join(this.logDir, `jet-logger.log.${i}`);
        if (fs.existsSync(oldLogFile)) {
          fs.unlinkSync(oldLogFile);
        }
      }
    } catch (error) {
      process.stderr.write(`Error cleaning up old log files: ${String(error)}\n`);
    }
  }

  /**
   * Get all available log files sorted by age (newest first)
   */
  public getLogFiles(): string[] {
    const logFiles: string[] = [];
    
    // Add current log file if it exists
    if (fs.existsSync(this.logFile)) {
      logFiles.push(this.logFile);
    }

    // Add rotated log files
    for (let i = 1; i <= this.maxLogFiles; i++) {
      const rotatedFile = path.join(this.logDir, `jet-logger.log.${i}`);
      if (fs.existsSync(rotatedFile)) {
        logFiles.push(rotatedFile);
      }
    }

    return logFiles;
  }

  /**
   * Get log file statistics
   */
  public getLogStats(): { totalFiles: number; totalSize: number; files: Array<{ name: string; size: number; modified: Date }> } {
    const logFiles = this.getLogFiles();
    const files = logFiles.map(file => {
      const stats = fs.statSync(file);
      return {
        name: path.basename(file),
        size: stats.size,
        modified: stats.mtime
      };
    });

    return {
      totalFiles: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      files
    };
  }
}

// Export singleton instance
export const logRotationService = new LogRotationService();

// Export constants for external use
export { LOG_DIR, LOG_FILE, MAX_LOG_SIZE, MAX_LOG_FILES };
