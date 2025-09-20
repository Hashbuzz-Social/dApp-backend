import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import logger from 'jet-logger';

/**
 * Middleware to handle Multer errors with user-friendly messages
 */
export const multerErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (error instanceof multer.MulterError) {
    logger.warn(
      `Multer error: ${error.message} | Code: ${error.code} | Field: ${error.field || 'unknown'} | User: ${req.currentUser?.id || 'unknown'}`
    );

    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(413).json({
          success: false,
          message: 'File too large. Maximum file size is 10MB per file.',
          error: 'FILE_TOO_LARGE',
          details: {
            maxSize: '10MB',
            field: error.field,
          },
        });

      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many files uploaded. Maximum 2 files allowed.',
          error: 'TOO_MANY_FILES',
          details: {
            maxFiles: 2,
            field: error.field,
          },
        });

      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Unexpected file field in upload.',
          error: 'UNEXPECTED_FILE_FIELD',
          details: {
            field: error.field,
          },
        });

      case 'LIMIT_PART_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many parts in multipart upload.',
          error: 'TOO_MANY_PARTS',
        });

      case 'LIMIT_FIELD_KEY':
        return res.status(400).json({
          success: false,
          message: 'Field name too long.',
          error: 'FIELD_NAME_TOO_LONG',
        });

      case 'LIMIT_FIELD_VALUE':
        return res.status(400).json({
          success: false,
          message: 'Field value too long.',
          error: 'FIELD_VALUE_TOO_LONG',
        });

      case 'LIMIT_FIELD_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many fields in upload.',
          error: 'TOO_MANY_FIELDS',
        });

      default:
        return res.status(400).json({
          success: false,
          message: 'File upload error occurred.',
          error: 'UPLOAD_ERROR',
          details: {
            code: error.code,
          },
        });
    }
  }

  // Not a Multer error, pass to next error handler
  next(error);
};
