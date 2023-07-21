import crypto from 'crypto';

const algorithm = 'aes-256-cbc';
const key = process.env.ENCRYPTION_KEY || ''; // Your encryption key from the environment variables
const iv = crypto.randomBytes(16);

// Function to encrypt data
function encrypt(text: string): string {
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key , "hex"), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

// Function to decrypt data
function decrypt(text: string): string {
  const [ivString, encryptedText] = text.split(':');
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key , "hex"), Buffer.from(ivString, 'hex'));
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export { encrypt, decrypt };
