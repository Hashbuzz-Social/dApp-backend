import { AccountId, PublicKey } from "@hashgraph/sdk";
import { generateChallenge, verifyPayloadChlange } from "@services/auth-challange";
import hederaService from "@services/hedera-service";
import SessionManager from "@services/SessionManager";
import signingService from "@services/signing-service";
import { fetchAccountInfoKey } from "@shared/helper";
import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { isEmpty } from "lodash";
import moment from "moment";

const { BAD_REQUEST, OK } = StatusCodes;

export const createChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.headers["x-forwarded-for"] as string;
    const fingerPrint = req.headers["x-device-fingerPrint"] as string;
    const payload = await generateChallenge(ip, fingerPrint);

    return res.status(200).json({ payload });
  } catch (error) {
    next(error);
  }
};

// Function to verify the client's response
export const vertifyResponseAndGenrateToekn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { originalPayload, signature, signingAccount } = req.body as { originalPayload: { id: string; message: string; timestamp: number }; signature: string; signingAccount: string };

    if (isEmpty(originalPayload) || isEmpty(signature) || isEmpty(signingAccount)) {
      return res.status(BAD_REQUEST).json({ message: "Invalid request" });
    }

    //? 1. verify payload data from redis service by comparing fimgureprint and ip of the current request;
    const { topicId, payload } = await verifyPayloadChlange(originalPayload);

    //? 2. Then get the public key from network
    const key = await fetchAccountInfoKey(signingAccount);
    const publicKey = PublicKey.fromString(key);

    // 3. then verify signatire using heders SDK
    const isValiClinetSignature = signingService.verifyMessageSignature(JSON.stringify(originalPayload), signature, publicKey);

    // !! if signature is invalid then return 400
    if (!isValiClinetSignature) {
      return res.status(BAD_REQUEST).json({ auth: false, message: "Invalid signature." });
    }
    //? 4. on successful verification submit event to hcs;
    await hederaService.submiHcstMessageToTopic({ topicId, message: JSON.stringify({ event: "HASHBUZZ_AUTH_SUCCESS", challengeId: payload.id, timestamp: moment.now() }) });

    //!! 5. Generate token and refresh token and update session
    let deviceId = SessionManager.handleDeviceId(req, res);
    const { deviceType, ipAddress, userAgent } = SessionManager.getDeviceInfo(req);
    const accAddress = AccountId.fromString(signingAccount).toSolidityAddress();
    const user = await SessionManager.upsertUserData(accAddress, signingAccount);
    const { token, refreshToken, expiry, kid } = SessionManager.generateTokens(signingAccount, user.id.toString());
    await SessionManager.checkAndUpdateSession(user.id, deviceId, deviceType, ipAddress, userAgent, kid, expiry);

    // 6. return success response
    return res.status(OK).json({ message: "Login Successfully", auth: true, ast: token, refreshToken, deviceId });
  } catch (error) {
    next(error);
  }
};
