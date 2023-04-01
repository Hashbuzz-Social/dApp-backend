import { ParamMissingError } from "@shared/errors";
import { NextFunction, Request, Response } from "express";
import { CustomValidator, validationResult } from "express-validator";
import statusCodes from "http-status-codes";
import { CreateTranSactionEntity } from "src/@types/custom";

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

export const validateEntityObject:CustomValidator = (createTransactionEntity:CreateTranSactionEntity) => {
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