import { v4 as uuidv4 } from 'uuid';
import createPrismaClient from '@shared/prisma';
import { campaign_media, user_user } from '@prisma/client';
import AWS from 'aws-sdk';
import { getConfig } from '@appConfig';
import { TwitterApi } from 'twitter-api-v2';
import twitterClient from '@shared/twitterAPI';
import userService from './user-service';

export class MediaService {
  private twitterClient: TwitterApi | null;
  private s3: AWS.S3;
  private BucketName: string = '';

  constructor() {
    this.twitterClient = null;
    this.s3 = new AWS.S3();
  }

  public async initialize() {
    const config = await getConfig();

    AWS.config.update({
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
      region: process.env.AWS_REGION,
    });
    this.BucketName = config.aws.bucketName;
  }

  public async uploadToS3(file: Express.Multer.File): Promise<string> {
    if (!this.BucketName) {
      throw new Error('AWS_S3_BUCKET_NAME is not defined');
    }

    const fileKey = `uploads/${uuidv4()}-${file.originalname}`;

    const params = {
      Bucket: this.BucketName,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'private', // Changed from public-read to private
    };

    try {
      await this.s3.upload(params).promise();
      return fileKey; // Return the S3 key instead of public URL
    } catch (error) {
      console.error('S3 Upload Error:', error);
      throw new Error('Failed to upload file to S3');
    }
  }

  public async getSignedUrl(fileKey: string): Promise<string> {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: fileKey,
      Expires: 60 * 5, // 5 minutes expiry
    };

    try {
      return this.s3.getSignedUrl('getObject', params);
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw new Error('Failed to generate signed URL');
    }
  }

  public async uploadToTwitter(
    file: Express.Multer.File,
    userId: number | bigint
  ): Promise<string> {
    console.log('Uploading to Twitter file', file);
    console.log('Uploading to Twitter userId', file.filename);
    try {
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      this.twitterClient = await twitterClient.createTwitterBizClient(user);
      const mediaId = await this.twitterClient.v1.uploadMedia(file.buffer, {
        mimeType: file.mimetype,
      });
      return mediaId;
    } catch (error) {
      console.error('Twitter Upload Error:', error);
      throw new Error('Failed to upload media to Twitter');
    }
  }

  public async saveMediaToDB(
    mediaData: Omit<campaign_media, 'id'>
  ): Promise<campaign_media> {
    const prisma = await createPrismaClient();

    try {
      return await prisma.campaign_media.create({
        data: { ...mediaData },
      });
    } catch (error) {
      console.error('DB Save Error:', error);
      throw new Error('Failed to save media to database');
    }
  }
}
