import { Request, Response, NextFunction } from 'express';
import logger from 'jet-logger';

/**
 * Middleware to log file upload details for debugging
 */
export const logUploadDetails = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log request headers for debugging
  const contentLength = req.get('content-length') || 'unknown';
  const contentType = req.get('content-type') || 'unknown';

  logger.info(`Upload attempt - Content-Length: ${contentLength}, Content-Type: ${contentType}`);  // Log uploaded files if any
  if (req.files && Array.isArray(req.files)) {
    req.files.forEach((file: Express.Multer.File, index: number) => {
      logger.info(`File ${index + 1}: ${file.originalname} - Size: ${file.size} bytes - MIME: ${file.mimetype}`);
    });

    const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
    logger.info(`Total upload size: ${totalSize} bytes (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
  } else {
    logger.info('No files uploaded in this request');
  }

  next();
};
