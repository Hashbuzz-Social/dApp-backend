import { MediaService } from '@services/media-service';
import { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import JSONBigInt from 'json-bigint';

export class MediaController {
  private mediaService: MediaService;

  constructor() {
    this.mediaService = new MediaService();
  }

  public uploadMedia = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!req.currentUser?.id) {
        return res.status(400).json({ error: 'User not authenticated' });
      }

      await this.mediaService.initialize();

      const xUploadresult = await this.mediaService.uploadToTwitter(
        req.file,
        req.currentUser.id
      );
      const result = await this.mediaService.uploadToS3(
        req.file,
        fs.readFileSync(req.file.path)
      );

      const mediaData = {
        media_type: req.file.mimetype,
        aws_location: result, // assuming result contains AWS S3 location
        twitter_media_id: xUploadresult, // assuming xUploadresult contains media_id
        owner_id: req.currentUser.id ?? BigInt(0),
        campaign_id: null, // or assign a valid campaign_id if available
      };

      await this.mediaService.saveMediaToDB(mediaData);

      return res.status(200).json({
        message: 'File uploaded successfully',
        data: JSONBigInt.parse(JSONBigInt.stringify(mediaData)),
      });
    } catch (error) {
      return next(error);
    }
  };
}
