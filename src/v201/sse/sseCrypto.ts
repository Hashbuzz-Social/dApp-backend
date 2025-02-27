import crypto from "crypto";

const SECRET_KEY = process.env.SSE_SECRET_KEY || "my_super_secret_key"; // Keep this safe
const IV_LENGTH = 16; // AES block size

export const encryptData = (data: any): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(SECRET_KEY), iv);
  
  let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
  encrypted += cipher.final("hex");

  return `${iv.toString("hex")}:${encrypted}`;
};

export const decryptData = (encryptedData: string): any => {
  const [iv, encrypted] = encryptedData.split(":");

  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(SECRET_KEY), Buffer.from(iv, "hex"));
  
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
};
