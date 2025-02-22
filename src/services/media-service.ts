import { getConfig } from '@appConfig';
import {
  GetObjectCommand,
  ObjectCannedACL,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { campaign_media } from '@prisma/client';
import createPrismaClient from '@shared/prisma';
import twitterClient from '@shared/twitterAPI';
import { TwitterApi } from 'twitter-api-v2';
import { v4 as uuidv4 } from 'uuid';
import userService from './user-service';

export class MediaService {
  private twitterClient: TwitterApi | null;
  private s3Client: S3Client;
  private BucketName: string;

  constructor() {
    this.twitterClient = null;
    this.s3Client = new S3Client({});
    this.BucketName = '';
  }

  public async initialize() {
    const config = await getConfig();

    this.s3Client = new S3Client({
      endpoint: config.bucket.endpoint,
      region: config.bucket.region,
      forcePathStyle: false,
      credentials: {
        accessKeyId: config.bucket.accessKeyId,
        secretAccessKey: config.bucket.secretAccessKey,
      },
    });
    this.BucketName = config.bucket.bucketName;
  }

  public async uploadToS3(
    file: Express.Multer.File,
    buffer: Buffer
  ): Promise<string> {
    if (!this.BucketName) {
      throw new Error('AWS_S3_BUCKET_NAME is not defined');
    }

    const fileKey = `uploads/${uuidv4()}-${file.filename}`;

    const params = {
      Bucket: this.BucketName,
      Key: fileKey,
      Body: buffer,
      ContentType: file.mimetype,
      ACL: ObjectCannedACL.private,
      Metadata: {
        'x-amz-meta-originalname': file.originalname,
        'x-amz-meta-mimetype': file.mimetype,
        'x-amz-meta-size': file.size.toString(),
        'x-amz-meta-uploadedby': 'admin',
        'x-amz-meta-uploadedon': new Date().toISOString(),
      },
    };

    try {
      await this.s3Client.send(new PutObjectCommand(params));
      return fileKey;
    } catch (error) {
      console.error('S3 Upload Error:', error);
      throw new Error('Failed to upload file to S3');
    }
  }

  public async getSignedUrl(fileKey: string): Promise<string> {
    const params = {
      Bucket: this.BucketName,
      Key: fileKey,
      Expires: 60 * 5,
    };

    try {
      return await getSignedUrl(this.s3Client, new GetObjectCommand(params));
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
