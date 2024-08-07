import { AccountId } from "@hashgraph/sdk"; // Adjust the path accordingly
import { ErrorWithCode } from "@shared/errors";
import { base64ToUint8Array, fetchAccountIfoKey } from "@shared/helper";
import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import HttpStatusCodes from "http-status-codes";
import { v4 as uuidv4 } from "uuid";
import { createAstToken } from "./authToken-service";
import hederaService from "./hedera-service";
import signingService from "./signing-service";

const { OK, BAD_REQUEST , UNAUTHORIZED} = HttpStatusCodes;

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
      let deviceId = req.deviceId ?? req.cookies.device_id;
      if (!deviceId) {
        deviceId = uuidv4();
        res.cookie("device_id", deviceId, { httpOnly: true, secure: true, sameSite: "strict" });
      }

      // Determine device type
      const deviceType = req.headers["user-agent"]?.includes("Mobi") ? "mobile" : "desktop";
      const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || null;
      const userAgent = req.headers["user-agent"] || null;

      const accAddress =  AccountId.fromString(accountId as string).toSolidityAddress();

      const create = {
        accountAddress:  accAddress,
        hedera_wallet_id: accountId,
        available_budget: 0,
        is_active: false,
      };
      const user  = await prisma.user_user.upsert({
        where: { accountAddress: accAddress },
        update: {
          last_login: new Date().toISOString(),
        },
        create,
      });

      const userId = user.id;

      // Create or update session
      const existingSession = await this.findSession(userId, deviceId);
      if (existingSession) {
        await this.updateSession(existingSession.id, token, refreshToken, expiry);
      } else {
        await this.createSession(userId, deviceId, deviceType, ipAddress, userAgent, token, refreshToken, expiry);
      }

      res.status(OK).json({ message: "Login Successfully", auth: true, ast: token, refreshToken, deviceId });
    } catch (err) {
      next(err);
    }
  }

  async handleLogout(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.token;
      const device_id = req.deviceId;
      const session = await prisma.user_sessions.findFirst({where:{token}});
      if(!session || !token || !device_id ) throw new ErrorWithCode("Unauthoriozed access requested" , UNAUTHORIZED);
      await prisma.user_sessions.delete({ where: {id:session.id} });
      res.status(OK).json({ message: "Logout Successfully" });
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

      return res.status(OK).json({ message: "Token Refreshed", ast: newToken });
    } catch (err) {
      next(err);
    }
  }

  /**
   * @description Check active session for the current user with current device
   * if any session then return sesssion details, if user exust then return wallet id of the user.
   */
  async checkSessionForPing(req: Request, res: Response, next: NextFunction) {
    const accountAddress = req.accountAddress;
    // const deviceId = req.cookies.device_id;
    const deviceId = req.deviceId;

    if (!accountAddress || !deviceId) {
      return res.status(BAD_REQUEST).json({ message: "No address or device ID found" });
    }

    const accountId = AccountId.fromSolidityAddress(accountAddress).toString();
    const currentTimestamp = new Date().toISOString();

    try {
      // Upsert user record or update last login
      await prisma.user_user.upsert({
        where: { accountAddress },
        update: { last_login: currentTimestamp },
        create: {
          accountAddress,
          hedera_wallet_id: accountId,
          available_budget: 0,
          is_active: false,
          ...(accountId === hederaService.operatorId.toString() && { role: "SUPER_ADMIN" }),
        },
      });

      // Check for an existing session on the current device
      const currentSession = await prisma.user_sessions.findFirst({
        where: {
          user_user: { accountAddress },
          device_id: deviceId,
          expires_at: { gt: currentTimestamp },
        },
        include: {
          user_user: true,
        },
      });

      if (currentSession) {
        return res.status(OK).json({
          status: "active",
          device_id: currentSession.device_id,
          wallet_id: currentSession.user_user.hedera_wallet_id,
        });
      }

      // Check for any other active sessions for the user
      const otherSessions = await prisma.user_sessions.findMany({
        where: {
          user_user: { accountAddress },
          device_id: { not: deviceId },
          expires_at: { gt: currentTimestamp },
        },
        include: {
          user_user: true,
        },
      });

      if (otherSessions.length > 0) {
        return res.status(OK).json({
          status: "has_other_sessions",
          other_sessions: otherSessions.map((session) => ({
            device_id: session.device_id,
            wallet_id: session.user_user.hedera_wallet_id,
          })),
          wallet_id: accountId,
        });
      }

      // If no active sessions are found
      return res.status(OK).json({ status: "no_active_sessions", wallet_id: accountId });
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
