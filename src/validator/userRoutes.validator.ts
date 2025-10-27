import { ParamMissingError } from "@shared/errors";
import { NextFunction, Request, Response } from "express";
import { CustomValidator, validationResult } from "express-validator";
import statusCodes from "http-status-codes";
import { CreateTranSactionEntity, GenerateAstPayload, GenerateAstPayloadV2 } from "src/@types/custom";

const { BAD_REQUEST } = statusCodes;



export const checkErrResponse = (_: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(_);
  if (!errors.isEmpty()) {
    return res.status(BAD_REQUEST).json({ errors: errors.array() });
  } else {
    next();
  }
};

export const checkWalletFormat: CustomValidator = (value: string) => {
  const regex = /[0]+\.+[0]+\.+[0-9]{1,10}/gm;
  const isMatching = regex.test(value);
  if (!isMatching) throw new ParamMissingError("Wallet id is in wrong format");
  return isMatching;
};

export const validateEntityObject: CustomValidator = (createTransactionEntity: CreateTranSactionEntity) => {
  if (
    !createTransactionEntity ||
    typeof createTransactionEntity !== 'object' ||
    typeof createTransactionEntity.entityType !== 'string' ||
    !createTransactionEntity.amount ||
    typeof createTransactionEntity.amount !== 'object' ||
    typeof createTransactionEntity.amount.value !== 'number' ||
    typeof createTransactionEntity.amount.fee !== 'number' ||
    typeof createTransactionEntity.amount.total !== 'number'
  ) {
    throw new ParamMissingError("Check entity object.it looks like in wrong format.");
  }
  return true;
}

export const validateGenerateAstPayload: CustomValidator = (body: GenerateAstPayload) => {
  if (
    body &&
    typeof body === "object" &&
    "payload" in body &&
    typeof body.payload === "object" &&
    "clientPayload" in body &&
    typeof body.clientPayload === "object" &&
    "signatures" in body &&
    typeof body.signatures === "object"
  ) {
    return true;
  }

  throw new ParamMissingError("Signature payload format is not correct.");
}

export const validateGenerateAstPayloadV2: CustomValidator = (body: GenerateAstPayloadV2) => {
  if (
    body &&
    typeof body === 'object' &&
    'payload' in body &&
    typeof body.payload === 'object' &&
    'signatures' in body &&
    typeof body.signatures === 'object' &&
    typeof body.signatures.server === 'string' &&
    typeof body.signatures.wallet === 'object' &&
    typeof body.signatures.wallet.accountId === 'string' &&
    typeof body.signatures.wallet.signature === 'string'
  ) {
    return true;
  }
  throw new ParamMissingError('Signature payload v2 format is not correct.');
}

export const  validateTransactionIdString = (input: string)  => {
  // Regular expression pattern for the given format
  const pattern = /^0\.0\.\d{1,10}@\d+\.\d+$/;

  // Check if the input string matches the pattern
  if (!pattern.test(input)) {
       throw new ParamMissingError("Misleading transaction id");
  }

  // Split the input string by '@' symbol
  const parts = input.split('@');

  // Extract account and timestamp from the parts
  const account = parts[0];
  const timestamp = parseFloat(parts[1]);

  // Check if the timestamp is not more than 30 seconds before the current timestamp
  const currentTimestamp = Date.now() / 1000; // Convert milliseconds to seconds
  if (
    timestamp > currentTimestamp ||
    currentTimestamp - timestamp > 10 * 1000
  ) {
    throw new ParamMissingError(
      'TransactionId is invalid. Time differ is too long'
    );
  }

  // Check if the account format is valid (0.0.[0-9] to 10 digits)
  const accountPattern = /^0\.0\.\d{1,10}$/;
  if (!accountPattern.test(account)) {
       throw new ParamMissingError("Invalid account format.");
  }

  // All validations passed
  return true;
}
