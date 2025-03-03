import { Request, Response, NextFunction } from 'express';
import { MediaService } from '@services/media-service';
import fs from 'fs';

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
        const uploadFile = fs.readFileSync(file.path);
        const result = await mediaService.uploadToS3(file, uploadFile);
        fs.unlinkSync(file.path); // Delete local file after upload
        return result;
      })
    );

    req.body.media = uploadedFiles;
    next();
  } catch (error) {
    next(error);
  }
};
