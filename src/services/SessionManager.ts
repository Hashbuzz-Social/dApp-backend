import { getConfig } from '@appConfig';
import { AccountId } from '@hashgraph/sdk';
import { d_decrypt } from '@shared/encryption';
import { ErrorWithCode } from '@shared/errors';
import { base64ToUint8Array } from '@shared/helper';
import NetworkHelpers from '@shared/NetworkHelpers';
import createPrismaClient from '@shared/prisma';
import { verifyRefreshToken } from '@shared/Verify';
import { NextFunction, Request, Response } from 'express';
import HttpStatusCodes from 'http-status-codes';
import BJSON from 'json-bigint';
import { createAstToken, genrateRefreshToken } from './authToken-service';
import initHederaService from './hedera-service';
import RedisClient from './redis-servie';
import signingService from './signing-service';

const { OK, BAD_REQUEST, UNAUTHORIZED } = HttpStatusCodes;

class SessionManager {
  private redisclinet: RedisClient;

  /** Constructor Methods */
  constructor(redisServerURI: string) {
    this.redisclinet = new RedisClient(redisServerURI);
  }

  static async create(): Promise<SessionManager> {
    const config = await getConfig();
    return new SessionManager(config.db.redisServerURI);
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

      const config = await getConfig();

      const clientAccountPublicKey = await this.fetchAndVerifyPublicKey(
        accountId
      );
      const isSignaturesValid = this.validateSignatures(
        payload,
        clientPayload,
        server,
        value,
        clientAccountPublicKey
      );

      if (!isSignaturesValid) {
        return res
          .status(400)
          .json({ auth: false, message: 'Invalid signature.' });
      }

      let deviceId = await this.handleDeviceId(req, res);

      if (!deviceId) {
        return res.error('Device ID not found', BAD_REQUEST);
      }

      const { deviceType, ipAddress, userAgent } = this.getDeviceInfo(req);
      const accAddress = AccountId.fromString(accountId).toSolidityAddress();

      const user = await this.upsertUserData(accAddress, accountId);
      const { token, refreshToken, expiry, kid } =
        (await this.generateTokens(accountId, user.id.toString())) || {};

      await this.checkAndUpdateSession(
        user.id,
        deviceId,
        deviceType,
        ipAddress,
        userAgent,
        kid!,
        expiry
      );

      // return res.created(resposeData, "Signature authenticated successfully");
      return res.status(OK).json({
        message: 'Login Successfully',
        auth: true,
        ast: token,
        refreshToken,
        deviceId: d_decrypt(deviceId, config.encryptions.encryptionKey),
      });
    } catch (err) {
      next(err);
    }
  }

  private async fetchAndVerifyPublicKey(accountId: string): Promise<string> {
    const config = await getConfig();
    const netWorkService = new NetworkHelpers(config.app.mirrorNodeURL);
    return await netWorkService.fetchAccountInfoKey(accountId);
  }

  private async validateSignatures(
    payload: object,
    clientPayload: object,
    server: string,
    value: string,
    clientAccountPublicKey: string
  ) {
    const hederaService = await initHederaService();
    const isServerSigValid = this.verifySignature(
      payload,
      hederaService.operatorKey.publicKey.toStringRaw(),
      server
    );
    const isClientSigValid = this.verifySignature(
      clientPayload,
      clientAccountPublicKey,
      value
    );
    return isServerSigValid && isClientSigValid;
  }

  async handleDeviceId(req: Request, res: Response) {
    let deviceId = req.deviceId;
    const config = await getConfig();
    if (deviceId) {
      res.cookie(
        'device_id',
        d_decrypt(deviceId, config.encryptions.encryptionKey),
        { httpOnly: true, secure: true, sameSite: 'strict' }
      );
    }
    return deviceId;
  }

  getDeviceInfo(req: Request) {
    const deviceType = req.headers['user-agent']?.includes('Mobi')
      ? 'mobile'
      : 'desktop';
    const ipAddress =
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      null;
    const userAgent = req.headers['user-agent'] || null;
    return { deviceType, ipAddress, userAgent };
  }

  async definerRoles(accAddress: string) {
    const prisma = await createPrismaClient();
    const trailSettersAccounts = await prisma.trailsetters.findMany();

    const isCurrentUserTrailsetter = trailSettersAccounts.some(
      (trailsetter) => trailsetter.walletId === accAddress
    );

    if (globalThis.adminAddress.includes(accAddress)) {
      return 'SUPER_ADMIN';
    } else if (isCurrentUserTrailsetter) {
      // loigic to verify the  NFT holding position and then go for the role
      return 'TRAILSETTER';
    } else {
      return 'GUEST_USER';
    }
  }

  async upsertUserData(accAddress: string, accountId: string) {
    const prisma = await createPrismaClient();
    return await prisma.user_user.upsert({
      where: { accountAddress: accAddress },
      update: { last_login: new Date().toISOString() },
      create: {
        accountAddress: accAddress,
        hedera_wallet_id: accountId,
        available_budget: 0,
        is_active: false,
        role: await this.definerRoles(accAddress),
      },
    });
  }

  async generateTokens(accountId: string, userId: string) {
    const { token, kid } = (await this.createToken(accountId, userId)) || {};
    const refreshToken = this.createRefreshToken(accountId, userId);
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return { token, refreshToken, expiry, kid };
  }

  async checkAndUpdateSession(
    userId: bigint,
    deviceId: string,
    deviceType: string,
    ipAddress: string | null,
    userAgent: string | null,
    kid: string,
    expiry: Date
  ) {
    const existingSession = await this.findSession(userId, deviceId);
    if (existingSession) {
      await this.updateSession(existingSession.id, kid, expiry);
    } else {
      await this.createSession(
        userId,
        deviceId,
        deviceType,
        ipAddress,
        userAgent,
        kid,
        expiry
      );
    }
  }

  async handleLogout(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.token;
      const device_id = req.deviceId;
      const { id, kid } = await this.tokenResolver(token as string);
      const prisma = await createPrismaClient();
      const session = await prisma.user_sessions.findFirst({
        where: { user_id: Number(id), kid, device_id },
      });
      if (!session || !token || !device_id)
        throw new ErrorWithCode('Unauthorized access requested', UNAUTHORIZED);

      // Clear CSRF token before deleting session
      res.clearCookie('XSRF-TOKEN', { path: '/' });

      await prisma.user_sessions.delete({ where: { id: session.id } });
      this.redisclinet.delete(`session::${id}::${device_id}`);

      res.clearCookie('aSToken', { path: '/', httpOnly: true });
      res.clearCookie('refreshToken', { path: '/', httpOnly: true });
      req.session.destroy((err) => {
        if (err) {
          return next(err);
        }
        res.success(undefined, 'Logout successfully');
      });
    } catch (err) {
      next(err);
    }
  }

  async tokenResolver(token: string) {
    const verifiedData = await verifyRefreshToken(token);
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

      const prisma = await createPrismaClient();

      const { id, kid } = await this.tokenResolver(refreshToken);

      if (!id && !kid)
        throw new ErrorWithCode('Invalid refresh token', UNAUTHORIZED);

      const session = await prisma.user_sessions.findFirst({
        where: { user_id: Number(id), kid, device_id: deviceId },
        include: { user_user: true },
      });

      if (!session) {
        return res
          .status(UNAUTHORIZED)
          .json({ message: 'Invalid refresh token' });
      }

      const { token: newToken, kid: newkid } =
        (await this.createToken(
          session.user_user.hedera_wallet_id,
          session.user_id.toString()
        )) || {};
      const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.updateSession(session.id, newkid!, newExpiry);

      return res
        .status(OK)
        .json({ message: 'Token refreshed successfully', ast: newToken });
    } catch (err) {
      next(err);
    }
  }

  /**
   * @description Check active session for the current user with current device
   * if any session then return sesssion details, if user exust then return wallet id of the user.
   */
  async checkSessionForPing(req: Request, res: Response, next: NextFunction) {
    try {
      const deviceId = req.deviceId;
      const userId = req.userId;
      if (!deviceId || !userId)
        throw new ErrorWithCode('Invalid request', BAD_REQUEST);

      // check if any existing  session for the user is exist or not
      const session = await this.findSession(userId, deviceId);
      const config = await getConfig();

      if (!session) {
        return res.unauthorized(
          'No active session found. Please intitate authentication.'
        );
      }

      const { user_user, device_id } = session;

      return res.status(OK).json({
        status: 'active',
        device_id: d_decrypt(device_id, config.encryptions.encryptionKey),
        wallet_id: user_user.hedera_wallet_id,
      });
    } catch (err) {
      next(err);
    }
  }

  public async findSession(userId: bigint | number, deviceId: string) {
    const sessionKey = `session::${userId}::${deviceId}`;
    const prisma = await createPrismaClient();
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
          include: {
            user_user: {
              select: {
                hedera_wallet_id: true,
                personal_twitter_handle: true,
                available_budget: true,
                last_login: true,
              },
            },
          },
        });
        if (session) {
          await this.redisclinet.create(
            sessionKey,
            BJSON.stringify(session),
            60 * 60
          );
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

  private async createSession(
    userId: bigint,
    deviceId: string,
    deviceType: string,
    ipAddress: string | null,
    userAgent: string | null,
    kid: string,
    expiry: Date
  ) {
    const prisma = await createPrismaClient();
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
    const prisma = await createPrismaClient();
    await prisma.user_sessions.update({
      where: { id: sessionId },
      data: {
        kid,
        expires_at: expiry,
        last_accessed: new Date(),
      },
    });
  }

  private verifySignature(
    payload: object,
    publicKey: string,
    signature: string
  ): boolean {
    return signingService.verifyData(
      payload,
      publicKey,
      base64ToUint8Array(signature)
    );
  }

  private async createToken(
    accountId: string,
    id: string
  ): Promise<{ token: string; kid: string } | undefined> {
    const ts = Date.now();
    const { signature } = await signingService.signData({ ts, accountId });
    return await createAstToken({
      id,
      ts,
      accountId,
      signature: Buffer.from(signature).toString('base64'),
    });
  }

  private async createRefreshToken(
    accountId: string,
    id: string
  ): Promise<string | undefined> {
    const ts = Date.now();
    const { signature } = await signingService.signData({ ts, accountId });
    return await genrateRefreshToken({
      id,
      ts,
      accountId,
      signature: Buffer.from(signature).toString('base64'),
    });
  }
}

export default SessionManager;
