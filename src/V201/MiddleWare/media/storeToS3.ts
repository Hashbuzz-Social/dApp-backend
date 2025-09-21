import { Request, Response, NextFunction } from 'express';
import { MediaService } from '@services/media-service';
import fs from 'fs';
import logger from 'jet-logger';

const mediaService = new MediaService();

export const storeMediaToS3 = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await mediaService.initialize();

    const uploadedFiles = await Promise.all(
      (Array.isArray(req.files) ? req.files : [])?.map(async (file) => {
        try {
          const uploadFile = fs.readFileSync(file.path);
          const result = await mediaService.uploadToS3(file, uploadFile);

          // Clean up local file after successful upload
          fs.unlinkSync(file.path);

          // Return only essential file information to avoid large JSON payloads
          return {
            key: result,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          };
        } catch (fileError) {
          logger.err(
            `Failed to upload file ${file.originalname}: ${
              fileError instanceof Error ? fileError.message : String(fileError)
            }`
          );

          // Clean up local file even on error
          try {
            fs.unlinkSync(file.path);
          } catch (cleanupError) {
            logger.warn(
              `Failed to clean up file ${file.path}: ${
                cleanupError instanceof Error
                  ? cleanupError.message
                  : String(cleanupError)
              }`
            );
          }

          throw fileError;
        }
      })
    );

    // Store media information in request body (now much smaller)
    req.body.media = uploadedFiles;
    logger.info(
      `Successfully uploaded ${uploadedFiles.length} media files to S3`
    );

    next();
  } catch (error) {
    logger.err(
      `Media upload error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    next(error);
  }
};
