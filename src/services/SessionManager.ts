import { getConfig } from '@appConfig';
import { AccountId, PublicKey } from '@hashgraph/sdk';
import { d_decrypt } from '@shared/encryption';
import { ErrorWithCode } from '@shared/errors';
import {
  base64ToUint8Array,
  sanitizeUserCoreData,
} from '@shared/helper';
import NetworkHelpers from '@shared/NetworkHelpers';
import createPrismaClient from '@shared/prisma';
import { verifyRefreshToken } from '@shared/Verify';
import { NextFunction, Request, Response } from 'express';
import HttpStatusCodes from 'http-status-codes';
import { default as BJSON, default as JSONBigInt } from 'json-bigint';
import { GenerateAstPayloadV2, Payload } from 'src/@types/custom';
import { createAstToken, genrateRefreshToken } from './authToken-service';
import initHederaService from './hedera-service';
import RedisClient from './redis-service';
import signingService from './signing-service';
import userService from './user-service';

const { OK, BAD_REQUEST, UNAUTHORIZED, INTERNAL_SERVER_ERROR } =
  HttpStatusCodes;

class SessionManager {
  private redisclinet: RedisClient;
  private secureCookie: boolean;

  /** Constructor Methods */
  constructor(redisServerURI: string) {
    this.redisclinet = new RedisClient(redisServerURI);
    // Set secure cookie for production OR when running on HTTPS (like dev server)
    const isProduction = process.env.NODE_ENV === 'production';
    const isHttpsEnv = Boolean(
      process.env.BACKEND_URL?.includes('https://') ||
        process.env.API_URL?.includes('https://')
    );
    this.secureCookie = isProduction || (process.env.NODE_ENV !== 'development' && isHttpsEnv);
  }

  static async create(): Promise<SessionManager> {
    const config = await getConfig();
    return new SessionManager(config.db.redisServerURI);
  }

  /**
   * Handles the common logic for generating auth AST tokens (v1 and v2).
   */
  private async handleGenerateAuthAstCommon(
    req: Request,
    res: Response,
    next: NextFunction,
    options: {
      getSignatureValidation: () => Promise<boolean> | boolean;
      getAccountId: () => string;
    }
  ): Promise<void> {
    try {
      const config = await getConfig();

      const isSignaturesValid = await options.getSignatureValidation();
      if (!isSignaturesValid) {
        res.status(400).json({ auth: false, message: 'Invalid signature.' });
        return;
      }

      const deviceId = await this.handleDeviceId(req, res);
      if (!deviceId) {
        return res.error('Device ID not found', BAD_REQUEST);
      }

      const { deviceType, ipAddress, userAgent } = this.getDeviceInfo(req);
      const accountId = options.getAccountId();
      const accAddress = AccountId.fromString(accountId).toSolidityAddress();

      const user = await this.upsertUserData(accAddress, accountId);
      const { token, refreshToken, expiry, kid } =
        (await this.generateTokens(accountId, user.id.toString())) || {};
      if (!token || !refreshToken) {
        throw new ErrorWithCode(
          'Token generation failed',
          INTERNAL_SERVER_ERROR
        );
      }

      await this.checkAndUpdateSession(
        user.id,
        deviceId,
        deviceType,
        ipAddress,
        userAgent,
        kid!,
        expiry
      );

      // Enhanced cookie configuration for cross-domain support
      const cookieConfig = await getConfig();

      // Set session data to ensure session is created and saved
      (req.session as any).userId = user.id.toString();
      (req.session as any).accountId = accountId;
      (req.session as any).deviceId = deviceId;
      (req.session as any).authenticated = true;

      // Force session save to ensure Set-Cookie header is sent
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      // SECURITY: Strict cookie configuration based on environment and trusted origins
      const origin = req.get('origin') || req.get('referer') || '';
      const host = req.get('host');
      const isProduction = process.env.NODE_ENV === 'production';

      // ENHANCED: Detect if this IS the dev server itself (not just a client)
      const isRunningOnDevServer =
        host?.includes('testnet-dev-api.hashbuzz.social') ||
        process.env.SERVER_ENV === 'development' ||
        process.env.SERVER_ENV === 'staging';

      // Define trusted origins for cross-origin cookie sharing
      const trustedCrossOrigins = [
        'https://testnet-dev-api.hashbuzz.social',
        'https://dev.hashbuzz.social',
        'https://www.hashbuzz.social',
        'https://hashbuzz.social',
      ];

      // SECURITY: Only allow sameSite=none for explicitly trusted origins
      const isTrustedCrossOrigin = trustedCrossOrigins.some((trusted) =>
        origin.includes(trusted)
      );

      // DEBUG: Log cookie configuration decision
      console.log('=== COOKIE CONFIG DEBUG ===');
      console.log(`Request Host: ${host || 'undefined'}`);
      console.log(`Request Origin: ${origin || 'undefined'}`);
      console.log(`NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
      console.log(`SERVER_ENV: ${process.env.SERVER_ENV || 'undefined'}`);
      console.log(`isProduction: ${String(isProduction)}`);
      console.log(`isRunningOnDevServer: ${String(isRunningOnDevServer)}`);
      console.log(`isTrustedCrossOrigin: ${String(isTrustedCrossOrigin)}`);

      // SECURITY: Determine cookie security based on environment and origin
      let cookieSettings;
      if (isProduction && !isRunningOnDevServer) {
        // PRODUCTION: Always secure, only sameSite=none for trusted origins
        cookieSettings = {
          secure: true,
          sameSite: isTrustedCrossOrigin ? 'none' : 'strict',
          domain: isTrustedCrossOrigin ? '.hashbuzz.social' : undefined,
        };
        console.log(
          'COOKIE CONFIG: Production mode - secure=true, sameSite=' +
            cookieSettings.sameSite
        );
      } else if (isTrustedCrossOrigin || isRunningOnDevServer) {
        // DEVELOPMENT/DEV SERVER: Trusted dev servers get cross-origin support
        cookieSettings = {
          secure: true, // Required for sameSite=none
          sameSite: 'none',
          domain: '.hashbuzz.social',
        };
        console.log(
          'COOKIE CONFIG: Dev server/trusted origin mode - secure=true, sameSite=none, domain=.hashbuzz.social'
        );
      } else {
        // DEVELOPMENT: Localhost and other origins get standard settings
        cookieSettings = {
          secure: false,
          sameSite: 'lax',
          domain: undefined,
        };
        console.log(
          'COOKIE CONFIG: Localhost mode - secure=false, sameSite=lax, domain=undefined'
        );
      }

      console.log('=== END COOKIE CONFIG DEBUG ===');

      // Access token cookie - with strict security controls
      res.cookie('access_token', token, {
        httpOnly: true,
        secure: cookieSettings.secure,
        sameSite: cookieSettings.sameSite as any,
        path: '/',
        maxAge: 1000 * 60 * 15, // 15 minutes
        domain: cookieSettings.domain,
      });

      // Refresh token cookie - with strict security controls
      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: cookieSettings.secure,
        sameSite: cookieSettings.sameSite as any,
        path: '/',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        domain: cookieSettings.domain,
      });

      res.status(OK).json({
        message: 'Login Successfully',
        auth: true,
        deviceId: d_decrypt(deviceId, config.encryptions.encryptionKey),
        user: JSONBigInt.parse(
          JSONBigInt.stringify(sanitizeUserCoreData(user))
        ),
      });
    } catch (err) {
      next(err);
    }
  }

  /** Public Methods
   * @description Generate auth AST token for the user (v1)
   */
  async handleGenerateAuthAst(req: Request, res: Response, next: NextFunction) {
    await this.handleGenerateAuthAstCommon(req, res, next, {
      getSignatureValidation: async () => {
        const { payload, clientPayload, signatures } = req.body;
        const { server, wallet } = signatures;
        const { value, accountId } = wallet;
        const clientAccountPublicKey = await this.fetchAndVerifyPublicKey(
          accountId
        );
        return this.validateSignatures(
          payload,
          clientPayload,
          server,
          value,
          clientAccountPublicKey
        );
      },
      getAccountId: () => req.body.signatures.wallet.accountId,
    });
  }

  /**
   * @description Generate auth AST token for the user (v2)
   */
  public async handleGenerateAuthAstv2(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    await this.handleGenerateAuthAstCommon(req, res, next, {
      getSignatureValidation: async () => {
        const { payload, signatures } = req.body as GenerateAstPayloadV2;
        const { server, wallet } = signatures;
        const { signature, accountId } = wallet;
        const clientAccountPublicKey = await this.fetchAndVerifyPublicKey(
          accountId
        );
        return this.validateSignatureSv2({
          originalPayload: payload,
          clientSignature: signature,
          serverSignature: server,
          clientAccountPublicKey,
        });
      },
      getAccountId: () =>
        (req.body as GenerateAstPayloadV2).signatures.wallet.accountId,
    });
  }

  private async validateSignatureSv2({
    originalPayload,
    clientSignature,
    serverSignature,
    clientAccountPublicKey,
  }: {
    originalPayload: Payload;
    clientSignature: string;
    serverSignature: string;
    clientAccountPublicKey: string;
  }) {
    const hederaService = await initHederaService();
    const isClientSigValid = this.clientVerifySignature({
      message: JSON.stringify(originalPayload),
      signature: clientSignature,
      publicKeyStr: clientAccountPublicKey,
    });
    const isServerSigValid = this.verifySignature(
      originalPayload,
      hederaService.operatorKey.publicKey.toStringRaw(),
      serverSignature
    );
    console.log({ isClientSigValid, isServerSigValid });
    return isClientSigValid && isServerSigValid;
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

  private prefixMessageToSign(message: string) {
    return '\x19Hedera Signed Message:\n' + message.length + message;
  }

  private clientVerifySignature({
    message,
    signature,
    publicKeyStr,
  }: {
    message: string;
    signature: string;
    publicKeyStr: string;
  }) {
    const messageWithPrefix = this.prefixMessageToSign(message);
    const messageBytes = new TextEncoder().encode(messageWithPrefix);
    const isValid = PublicKey.fromString(publicKeyStr).verify(
      messageBytes,
      base64ToUint8Array(signature)
    );

    return isValid;
  }

  async handleDeviceId(req: Request, res: Response) {
    const deviceId = req.deviceId;
    const config = await getConfig();

    if (deviceId) {
      // SECURITY: Use same trusted origin logic as access tokens
      const origin = req.get('origin') || req.get('referer') || '';
      const isProduction = process.env.NODE_ENV === 'production';

      const trustedCrossOrigins = [
        'https://testnet-dev-api.hashbuzz.social',
        'https://dev.hashbuzz.social',
        'https://www.hashbuzz.social',
        'https://hashbuzz.social',
      ];

      const isTrustedCrossOrigin = trustedCrossOrigins.some((trusted) =>
        origin.includes(trusted)
      );

      // SECURITY: Determine cookie security based on environment and origin
      let cookieSettings;
      if (isProduction) {
        cookieSettings = {
          secure: true,
          sameSite: isTrustedCrossOrigin ? 'none' : 'strict',
          domain: isTrustedCrossOrigin ? '.hashbuzz.social' : undefined,
        };
      } else if (isTrustedCrossOrigin) {
        cookieSettings = {
          secure: true,
          sameSite: 'none',
          domain: '.hashbuzz.social',
        };
      } else {
        cookieSettings = {
          secure: false,
          sameSite: 'lax',
          domain: undefined,
        };
      }

      res.cookie(
        'device_id',
        d_decrypt(deviceId, config.encryptions.encryptionKey),
        {
          httpOnly: true,
          secure: cookieSettings.secure,
          sameSite: cookieSettings.sameSite as any,
          path: '/',
          domain: cookieSettings.domain,
        }
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
    const refreshToken = await this.createRefreshToken(accountId, userId);
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

      res.clearCookie('access_token', { path: '/', httpOnly: true });
      res.clearCookie('refresh_token', { path: '/', httpOnly: true });
      res.clearCookie('device_id', {
        path: '/',
        httpOnly: true,
        secure: this.secureCookie,
        sameSite: 'strict',
      });
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
      const refreshToken = req.cookies.refresh_token;
      const deviceId = req.deviceId;

      if (!refreshToken) {
        return res
          .status(UNAUTHORIZED)
          .json({ message: 'No refresh token provided' });
      }

      if (!deviceId) {
        return res.status(BAD_REQUEST).json({ message: 'Device ID required' });
      }

      const prisma = await createPrismaClient();

      const { id, kid } = await this.tokenResolver(refreshToken);

      if (!id || !kid) {
        return res
          .status(UNAUTHORIZED)
          .json({ message: 'Invalid refresh token' });
      }

      const session = await prisma.user_sessions.findFirst({
        where: { user_id: Number(id), kid, device_id: deviceId },
        include: { user_user: true },
      });

      if (!session) {
        return res
          .status(UNAUTHORIZED)
          .json({ message: 'Invalid refresh token' });
      }

      // Check if session has expired
      if (session.expires_at && new Date() > session.expires_at) {
        return res.status(UNAUTHORIZED).json({ message: 'Session expired' });
      }

      const { token: newToken, kid: newkid } =
        (await this.createToken(
          session.user_user.hedera_wallet_id,
          session.user_id.toString()
        )) || {};

      if (!newToken || !newkid) {
        throw new ErrorWithCode(
          'Token generation failed',
          INTERNAL_SERVER_ERROR
        );
      }

      const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.updateSession(session.id, newkid, newExpiry);

      // Enhanced cookie configuration for refresh token endpoint
      const refreshConfig = await getConfig();
      const isDevServer = refreshConfig.app.xCallBackHost?.includes(
        'testnet-dev-api.hashbuzz.social'
      );
      const isDevelopment = process.env.NODE_ENV === 'development';

      // Set new access token cookie with enhanced cross-domain settings
      res.cookie('access_token', newToken, {
        httpOnly: true,
        secure: this.secureCookie || isDevServer,
        sameSite: isDevServer || !isDevelopment ? 'none' : 'lax',
        path: '/',
        maxAge: 1000 * 60 * 15, // 15 minutes
        domain: isDevServer ? '.hashbuzz.social' : undefined,
      });

      // Calculate the actual expiry timestamp for the token (15 minutes from now)
      const tokenExpiresAt = Date.now() + 15 * 60 * 1000;

      return res.status(OK).json({
        message: 'Token refreshed successfully',
        ast: newToken,
        expiresAt: tokenExpiresAt,
      });
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

      // Get user data with proper include to ensure we have user_user relation
      const prisma = await createPrismaClient();
      const sessionWithUser = await prisma.user_sessions.findFirst({
        where: {
          user_id: userId,
          device_id: deviceId,
        },
        include: {
          user_user: {
            select: {
              hedera_wallet_id: true,
              personal_twitter_handle: true,
            },
          },
        },
      });

      if (!sessionWithUser || !sessionWithUser.user_user) {
        return res.unauthorized(
          'No active session found. Please intitate authentication.'
        );
      }

      const isExistingUser = await userService.findUserByWalletId(
        sessionWithUser.user_user.hedera_wallet_id
      );

      return res.status(OK).json({
        status: 'active',
        device_id: d_decrypt(
          sessionWithUser.device_id,
          config.encryptions.encryptionKey
        ),
        wallet_id: sessionWithUser.user_user.hedera_wallet_id,
        isAuthenticated: !!isExistingUser,
        connectedXAccount: isExistingUser?.personal_twitter_handle,
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
        return JSON.parse(session) as Awaited<
          ReturnType<typeof prisma.user_sessions.findFirst>
        >;
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
