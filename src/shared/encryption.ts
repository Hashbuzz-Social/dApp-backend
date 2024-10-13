import crypto from 'crypto';

const algorithm = 'aes-256-cbc';
const d_algo = 'aes-256-ctr';  // Use CTR mode for deterministic encryption
const ivLength = 16; // For AES, this is always 16
const key = process.env.ENCRYPTION_KEY as string;

if (!key) {
  throw new Error('ENCRYPTION_KEY environment variable is not set');
}

if (key.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be a 32-byte (64 hex characters) string');
}

/**
 * Encrypts data using AES-256-CBC.
 * @param text - The text to encrypt.
 * @returns The encrypted text in the format iv:encryptedText.
 */
const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

/**
 * Decrypts data using AES-256-CBC.
 * @param text - The encrypted text in the format iv:encryptedText.
 * @returns The decrypted text.
 */
const decrypt = (text: string): string => {
  const [ivString, encryptedText] = text.split(':');
  const iv = Buffer.from(ivString, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

/**
 * Deterministic encryption and decryption of data for device_id specific for now.
 */
const d_iv = Buffer.alloc(ivLength, 0); // Use a zero-filled IV for deterministic encryption

/**
 * Encrypts data deterministically using AES-256-CTR.
 * @param text - The text to encrypt.
 * @returns The encrypted text in hexadecimal format.
 */
const d_encrypt = (text: string): string => {
  const cipher = crypto.createCipheriv(d_algo, Buffer.from(key, 'hex'), d_iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return encrypted.toString('hex');
};

/**
 * Decrypts data deterministically using AES-256-CTR.
 * @param hash - The encrypted text in hexadecimal format.
 * @returns The decrypted text.
 */
const d_decrypt = (hash: string): string => {
  const decipher = crypto.createDecipheriv(d_algo, Buffer.from(key, 'hex'), d_iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(hash, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
};

export { encrypt, decrypt, d_encrypt, d_decrypt };