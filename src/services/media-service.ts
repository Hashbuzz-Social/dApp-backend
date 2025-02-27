import { getConfig } from '@appConfig';
import {
  GetObjectCommand,
  ObjectCannedACL,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { campaign_media } from '@prisma/client';
import { decrypt } from '@shared/encryption';
import createPrismaClient from '@shared/prisma';
import twitterAPI from '@shared/twitterAPI';
import { Readable } from 'stream';
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
      if (
        !user ||
        !user.business_twitter_access_token ||
        !user.business_twitter_access_token_secret
      ) {
        throw new Error('User not found');
      }

      const config = await getConfig();

      const userTwitter = await twitterAPI.tweeterApiForUser({
        accessToken: decrypt(
          user.business_twitter_access_token,
          config.encryptions.encryptionKey
        ),
        accessSecret: decrypt(
          user?.business_twitter_access_token_secret,
          config.encryptions.encryptionKey
        ),
      });

      const mediaId = await userTwitter.v1.uploadMedia(file.buffer, {
        mimeType: file.mimetype,
      });
      return mediaId;
    } catch (error) {
      console.error('Twitter Upload Error:', error);
      throw new Error('Failed to upload media to Twitter');
    }
  }

  public async readFromS3(fileKey: string): Promise<Express.Multer.File> {
    const params = {
      Bucket: this.BucketName,
      Key: fileKey,
    };

    try {
      const data = await this.s3Client.send(new GetObjectCommand(params));
      const buffer = await this.streamToBuffer(
        data.Body as NodeJS.ReadableStream
      );

      const file: Express.Multer.File = {
        fieldname: '',
        originalname: data.Metadata?.['x-amz-meta-originalname'] || '',
        encoding: '',
        mimetype: data.Metadata?.['x-amz-meta-mimetype'] || '',
        size: parseInt(data.Metadata?.['x-amz-meta-size'] || '0', 10),
        destination: '',
        filename: fileKey,
        path: '',
        stream: data.Body as Readable,
        buffer: buffer,
      };

      return file;
    } catch (error) {
      console.error('S3 Read Error:', error);
      throw new Error('Failed to read file from S3');
    }
  }

  private async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
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
