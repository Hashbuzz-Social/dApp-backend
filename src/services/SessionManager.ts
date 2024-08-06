import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { AccountId } from "@hashgraph/sdk"; // Adjust the path accordingly
import { base64ToUint8Array, fetchAccountIfoKey } from "@shared/helper";
import hederaService from "./hedera-service";
import prisma from "@shared/prisma";
import signingService from "./signing-service";
import { createAstToken } from "./authToken-service";

class SessionManager {
  async handleGenerateAuthAst(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        payload,
        clientPayload,
        signatures: {
          server,
          wallet: { value, accountId },
        },
      } = req.body;

      // Fetch and verify public key
      const clientAccountPublicKey = await fetchAccountIfoKey(accountId as string);
      const isServerSigValid = this.verifySignature(payload, hederaService.operatorKey.publicKey.toStringRaw(), server);
      const isClientSigValid = this.verifySignature(clientPayload, clientAccountPublicKey, value);

      if (!isServerSigValid || !isClientSigValid) {
        return res.status(400).json({ auth: false, message: "Invalid signature." });
      }

      // Generate tokens
      const token = this.createToken(accountId);
      const refreshToken = uuidv4();
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Handle device ID
      let deviceId = req.cookies.device_id;
      if (!deviceId) {
        deviceId = uuidv4();
        res.cookie("device_id", deviceId, { httpOnly: true, secure: true, sameSite: "strict" });
      }

      // Determine device type
      const deviceType = req.headers["user-agent"]?.includes("Mobi") ? "mobile" : "desktop";
      const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || null;
      const userAgent = req.headers["user-agent"] || null;

      // Fetch user ID
      const user = await prisma.user_user.findUnique({ where: { accountAddress: AccountId.fromString(accountId as string).toSolidityAddress() } });
      if (!user) {
        return res.status(400).json({ auth: false, message: "User not found" });
      }

      const userId = user.id;

      // Create or update session
      const existingSession = await this.findSession(userId, deviceId);
      if (existingSession) {
        await this.updateSession(existingSession.id, token, refreshToken, expiry);
      } else {
        await this.createSession(userId, deviceId, deviceType, ipAddress, userAgent, token, refreshToken, expiry);
      }

      res.status(200).json({ message: "Login Successfully", auth: true, ast: token, refreshToken, deviceId });
    } catch (err) {
      next(err);
    }
  }

  async handleLogout(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.body;
      await prisma.user_sessions.delete({ where: { token } });
      res.status(200).json({ message: "Logout Successfully" });
    } catch (err) {
      next(err);
    }
  }

  async handleRefreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      const session = await prisma.user_sessions.findUnique({ where: { refresh_token: refreshToken } });

      if (!session) {
        return res.status(401).json({ message: "Invalid refresh token" });
      }

      const newToken = this.createToken(session.user_id.toString());
      const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.updateSession(session.id, newToken, refreshToken, newExpiry);

      res.status(200).json({ message: "Token Refreshed", ast: newToken });
    } catch (err) {
      next(err);
    }
  }

  private async findSession(userId: bigint | number, deviceId: string) {
    return await prisma.user_sessions.findFirst({
      where: {
        user_id: userId,
        device_id: deviceId,
      },
    });
  }

  private async createSession(userId: bigint, deviceId: string, deviceType: string, ipAddress: string | null, userAgent: string | null, token: string, refreshToken: string, expiry: Date) {
    await prisma.user_sessions.create({
      data: {
        user_id: userId,
        device_id: deviceId,
        device_type: deviceType,
        ip_address: ipAddress,
        user_agent: userAgent,
        token,
        refresh_token: refreshToken,
        expires_at: expiry,
      },
    });
  }

  private async updateSession(sessionId: bigint, token: string, refreshToken: string, expiry: Date) {
    await prisma.user_sessions.update({
      where: { id: sessionId },
      data: {
        token,
        refresh_token: refreshToken,
        expires_at: expiry,
        last_accessed: new Date(),
      },
    });
  }

  private verifySignature(payload: object, publicKey: string, signature: string): boolean {
    return signingService.verifyData(payload, publicKey, base64ToUint8Array(signature));
  }

  private createToken(accountId: string): string {
    const ts = Date.now();
    const { signature } = signingService.signData({ ts, accountId });
    return createAstToken({ ts, accountId, signature: Buffer.from(signature).toString("base64") });
  }
}

export default new SessionManager();
