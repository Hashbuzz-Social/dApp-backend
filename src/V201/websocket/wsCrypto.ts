/* eslint-disable */
import { getConfig } from '@appConfig';
import crypto from 'crypto';

// const SECRET_KEY = process.env.SSE_SECRET_KEY || "my_super_secret_key"; // Keep this safe
const IV_LENGTH = 16; // AES block size

export const encryptData = async (data: any): Promise<string> => {
  const config = await getConfig();
  const iv = crypto.randomBytes(IV_LENGTH);
  const keyBuf = crypto
    .createHash('sha256')
    .update(config.encryptions.encryptionKey)
    .digest();
  const key = new Uint8Array(
    keyBuf.buffer,
    keyBuf.byteOffset,
    keyBuf.byteLength
  );
  const cipher = crypto.createCipheriv('aes-256-cbc' as any, key, iv as any);

  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
};

export const decryptData = async <T = unknown>(encryptedData: string): Promise<T> => {
    const config = await getConfig();
    const [iv, encrypted] = encryptedData.split(':');

    const keyBuf2 = crypto
        .createHash('sha256')
        .update(config.encryptions.encryptionKey)
        .digest();
    const key2 = new Uint8Array(
        keyBuf2.buffer,
        keyBuf2.byteOffset,
        keyBuf2.byteLength
    );
    const decipher = crypto.createDecipheriv(
        'aes-256-cbc' as any,
        key2,
        Buffer.from(iv, 'hex') as any
    );

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted) as T;
};
