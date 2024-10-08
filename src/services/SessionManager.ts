import { AccountId } from "@hashgraph/sdk"; // Adjust the path accordingly
import { ErrorWithCode } from "@shared/errors";
import { base64ToUint8Array, fetchAccountInfoKey } from "@shared/helper";
import prisma from "@shared/prisma";
import { verifyRefreshToken } from "@shared/Verify";
import { NextFunction, Request, Response } from "express";
import HttpStatusCodes from "http-status-codes";
import BJSON from "json-bigint";
import { createAstToken, genrateRefreshToken } from "./authToken-service";
import hederaService from "./hedera-service";
import RedisClient from "./redis-servie";
import signingService from "./signing-service";
import { decrypt } from "@shared/encryption";

const { OK, BAD_REQUEST, UNAUTHORIZED } = HttpStatusCodes;

class SessionManager {
  private redisclinet: RedisClient;

  /** Constructor Methods */
  constructor() {
    this.redisclinet = new RedisClient();
  }

  /** Public Methods
   * @description Generate auth AST token for the user
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   * @returns {Promise<void>}
   */
  async handleGenerateAuthAst(req: Request, res: Response, next: NextFunction) {
    try {
      const { payload, clientPayload, signatures } = req.body;
      const { server, wallet } = signatures;
      const { value, accountId } = wallet;

      const clientAccountPublicKey = await this.fetchAndVerifyPublicKey(accountId);
      const isSignaturesValid = this.validateSignatures(payload, clientPayload, server, value, clientAccountPublicKey);

      if (!isSignaturesValid) {
        return res.status(400).json({ auth: false, message: "Invalid signature." });
      }

      let deviceId = this.handleDeviceId(req, res);

      if (!deviceId) {
        return res.error("Device ID not found", BAD_REQUEST);
      }

      const { deviceType, ipAddress, userAgent } = this.getDeviceInfo(req);
      const accAddress = AccountId.fromString(accountId).toSolidityAddress();

      const user = await this.upsertUserData(accAddress, accountId);
      const { token, refreshToken, expiry, kid } = this.generateTokens(accountId, user.id.toString());

      await this.checkAndUpdateSession(user.id, deviceId, deviceType, ipAddress, userAgent, kid, expiry);

      res.status(OK).json({ message: "Login Successfully", auth: true, ast: token, refreshToken, deviceId });
    } catch (err) {
      next(err);
    }
  }

  private async fetchAndVerifyPublicKey(accountId: string) {
    return await fetchAccountInfoKey(accountId);
  }

  private validateSignatures(payload: object, clientPayload: object, server: string, value: string, clientAccountPublicKey: string) {
    const isServerSigValid = this.verifySignature(payload, hederaService.operatorKey.publicKey.toStringRaw(), server);
    const isClientSigValid = this.verifySignature(clientPayload, clientAccountPublicKey, value);
    return isServerSigValid && isClientSigValid;
  }

  handleDeviceId(req: Request, res: Response) {
    let deviceId = req.deviceId;
    if (deviceId) {
      res.cookie("device_id", deviceId, { httpOnly: true, secure: true, sameSite: "strict" });
    }
    return deviceId;
  }

  getDeviceInfo(req: Request) {
    const deviceType = req.headers["user-agent"]?.includes("Mobi") ? "mobile" : "desktop";
    const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || null;
    return { deviceType, ipAddress, userAgent };
  }

  async upsertUserData(accAddress: string, accountId: string) {
    return await prisma.user_user.upsert({
      where: { accountAddress: accAddress },
      update: { last_login: new Date().toISOString() },
      create: {
        accountAddress: accAddress,
        hedera_wallet_id: accountId,
        available_budget: 0,
        is_active: false,
      },
    });
  }

  generateTokens(accountId: string, userId: string) {
    const { token, kid } = this.createToken(accountId, userId);
    const refreshToken = this.createRefreshToken(accountId, userId);
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return { token, refreshToken, expiry, kid };
  }

  async checkAndUpdateSession(userId: bigint, deviceId: string, deviceType: string, ipAddress: string | null, userAgent: string | null, kid: string, expiry: Date) {
    const existingSession = await this.findSession(userId, deviceId);
    if (existingSession) {
      await this.updateSession(existingSession.id, kid, expiry);
    } else {
      await this.createSession(userId, deviceId, deviceType, ipAddress, userAgent, kid, expiry);
    }
  }

  async handleLogout(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.token;
      const device_id = req.deviceId;
      const { id, kid } = this.tokenResolver(token as string);
      const session = await prisma.user_sessions.findFirst({ where: { id: Number(id), kid } });
      if (!session || !token || !device_id) throw new ErrorWithCode("Unauthoriozed access requested", UNAUTHORIZED);
      await prisma.user_sessions.delete({ where: { id: session.id } });
      res.status(OK).json({ message: "Logout Successfully" });
    } catch (err) {
      next(err);
    }
  }

  tokenResolver(token: string) {
    const verifiedData = verifyRefreshToken(token);
    //@ts-ignore
    const id = verifiedData.payload.id as string;
    //@ts-ignore
    const kid = verifiedData.kid as string;

    return { id, kid };
  }

  async handleRefreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      const deviceId = req.deviceId;

      const { id, kid } = this.tokenResolver(refreshToken);

      if (!id && !kid) throw new ErrorWithCode("Invalid refresh token", UNAUTHORIZED);

      const session = await prisma.user_sessions.findFirst({ where: { user_id: Number(id), kid, device_id: deviceId }, include: { user_user: true } });

      if (!session) {
        return res.status(UNAUTHORIZED).json({ message: "Invalid refresh token" });
      }

      const { token: newToken, kid: newkid } = this.createToken(session.user_user.hedera_wallet_id, session.user_id.toString());
      const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.updateSession(session.id, newkid, newExpiry);

      return res.status(OK).json({ message: "Token refreshed successfully", ast: newToken });
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

    console.log("deviceId", deviceId);

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
          device_id: decrypt(currentSession.device_id),
          wallet_id: currentSession.user_user.hedera_wallet_id,
        });
      }

      return res.unauthorized("No active session found for current device");
    } catch (err) {
      next(err);
    }
  }

  public async findSession(userId: bigint | number, deviceId: string) {
    const sessionKey = `session::${userId}::${deviceId}`;
    if (this.redisclinet.client) {
      const session = await this.redisclinet.read(sessionKey);
      if (session) {
        return JSON.parse(session);
      } else {
        const session = await prisma.user_sessions.findFirst({
          where: {
            user_id: userId,
            device_id: deviceId,
          },
        });
        if (session) {
          await this.redisclinet.create(sessionKey, BJSON.stringify(session));
        }
        return session;
      }
    }
    return await prisma.user_sessions.findFirst({
      where: {
        user_id: userId,
        device_id: deviceId,
      },
    });
  }

  /**
   *
   * @param userId request user id
   * @param deviceId request device id
   * @param deviceType request device type
   * @param ipAddress request ip address
   * @param userAgent request user agent
   * @param kid keystore unique id
   * @param expiry key expiry date
   */

  private async createSession(userId: bigint, deviceId: string, deviceType: string, ipAddress: string | null, userAgent: string | null, kid: string, expiry: Date) {
    await prisma.user_sessions.create({
      data: {
        user_id: userId,
        device_id: deviceId,
        device_type: deviceType,
        ip_address: ipAddress,
        user_agent: userAgent,
        kid,
        expires_at: expiry,
      },
    });
  }

  private async updateSession(sessionId: bigint, kid: string, expiry: Date) {
    await prisma.user_sessions.update({
      where: { id: sessionId },
      data: {
        kid,
        expires_at: expiry,
        last_accessed: new Date(),
      },
    });
  }

  private verifySignature(payload: object, publicKey: string, signature: string): boolean {
    return signingService.verifyData(payload, publicKey, base64ToUint8Array(signature));
  }

  private createToken(accountId: string, id: string): { token: string; kid: string } {
    const ts = Date.now();
    const { signature } = signingService.signData({ ts, accountId });
    return createAstToken({ id, ts, accountId, signature: Buffer.from(signature).toString("base64") });
  }

  private createRefreshToken(accountId: string, id: string): string {
    const ts = Date.now();
    const { signature } = signingService.signData({ ts, accountId });
    return genrateRefreshToken({ id, ts, accountId, signature: Buffer.from(signature).toString("base64") });
  }
}

export default new SessionManager();
