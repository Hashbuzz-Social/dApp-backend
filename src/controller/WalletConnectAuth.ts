import { generateChallenge } from "@services/auth-challange";
import { NextFunction, Request, Response } from "express";

export const createChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.headers["x-forwarded-for"] as string;
    const fingerPrint = req.headers["x-device-fingerPrint"] as string;
    const payload = generateChallenge(ip, fingerPrint);

    return res.status(200).json({ payload });
  } catch (error) {
    next(error);
  }
};

// Function to verify the client's response
export const vertifyResponse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { originalPayload, signature, signingAccount } = req.body;

    //? 1. verify payload data from redis service by comparing fimgureprint and ip of the current request;

    //? 2. Then get the public key from network

    // 3. then verify signatire using heders SDK

    //? 4. on successful verification submit event to hcs;
  } catch (error) {
    next(error);
  }
};
