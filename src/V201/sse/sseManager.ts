import { Request, Response } from "express";
import { encryptData } from "./sseCrypto";

const clients = new Map<string, Response>(); // { userId: response }

export const sseHandler = (req: Request, res: Response) => {
  const userId = req.currentUser?.id; // Extract from JWT auth middleware
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Configure SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  clients.set(userId.toString(), res);
  console.log(`✅ User ${userId} connected to SSE`);

  req.on("close", () => {
    clients.delete(userId.toString());
    console.log(`❌ User ${userId} disconnected`);
  });
};

// Send encrypted data to a specific user
export const sendEncryptedSSE = (userId: string, event: string, data: any) => {
  const client = clients.get(userId);
  if (client) {
    const encryptedData = encryptData(data);
    client.write(`event: ${event}\n`);
    client.write(`data: ${encryptedData}\n\n`);
  }
};
