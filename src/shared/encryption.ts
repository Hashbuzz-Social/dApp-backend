import crypto from 'crypto';

const algorithm = 'aes-256-cbc';
const key = process.env.ENCRYPTION_KEY || '';
const iv = crypto.randomBytes(16);

// Function to encrypt data
const encrypt = (text: string): string => {
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, "hex"), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

// Function to decrypt data
const decrypt = (text: string): string => {
  const [ivString, encryptedText] = text.split(':');
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, "hex"), Buffer.from(ivString, 'hex'));
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
*@description Determistic encyption and decryption of data for device_id sepecific for now.
*/

const d_algo = 'aes-256-ctr';  // Use CTR mode for deterministic encryption
const d_iv = Buffer.alloc(16, 0);

// Encrypt function
const d_encrypt = (text: string): string => {
  const cipher = crypto.createCipheriv(d_algo, key, d_iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  return encrypted.toString('hex');
}

// Decrypt function
const d_decrypt = (hash: string): string => {
  const decipher = crypto.createDecipheriv(d_algo, key, d_iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(hash, 'hex')), decipher.final()]);
  return decrypted.toString();
}


export { encrypt, decrypt, d_encrypt, d_decrypt };