import crypto from 'crypto';

const algorithm = 'aes-256-cbc';
const d_algo = 'aes-256-ctr';  // Use CTR mode for deterministic encryption
const ivLength = 16; // For AES, this is always 16

/**
 * Encrypts data using AES-256-CBC.
 * @param text - The text to encrypt.
 * @returns The encrypted text in the format iv:encryptedText.
 */
const encrypt = (text: string, encryptionKey: string): string => {
  const iv = crypto.randomBytes(ivLength);
  const key = new Uint8Array(Buffer.from(encryptionKey, 'hex'));
  const ivArray = new Uint8Array(iv);
  const cipher = crypto.createCipheriv(algorithm, key, ivArray);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

/**
 * Decrypts data using AES-256-CBC.
 * @param text - The encrypted text in the format iv:encryptedText.
 * @returns The decrypted text.
 */
const decrypt = (text: string, encryptionKey: string): string => {
  const [ivString, encryptedText] = text.split(':');
  const iv = new Uint8Array(Buffer.from(ivString, 'hex'));
  const key = new Uint8Array(Buffer.from(encryptionKey, 'hex'));
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

/**
 * Deterministic encryption and decryption of data for device_id specific for now.
 */
const d_iv = new Uint8Array(ivLength); // Use a zero-filled IV for deterministic encryption

/**
 * Encrypts data deterministically using AES-256-CTR.
 * @param text - The text to encrypt.
 * @returns The encrypted text in hexadecimal format.
 */
const d_encrypt = (text: string, encryptionKey: string): string => {
  const key = new Uint8Array(Buffer.from(encryptionKey, 'hex'));
  const cipher = crypto.createCipheriv(d_algo, key, d_iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

/**
 * Decrypts data deterministically using AES-256-CTR.
 * @param hash - The encrypted text in hexadecimal format.
 * @returns The decrypted text.
 */
const d_decrypt = (hash: string, encryptionKey: string): string => {
  const key = new Uint8Array(Buffer.from(encryptionKey, 'hex'));
  const decipher = crypto.createDecipheriv(d_algo, key, d_iv);
  let decrypted = decipher.update(hash, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

export { encrypt, decrypt, d_encrypt, d_decrypt };