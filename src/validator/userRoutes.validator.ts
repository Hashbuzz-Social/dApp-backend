import { ParamMissingError } from "@shared/errors";
import { CustomValidator } from "express-validator";

export const checkWalletFormat: CustomValidator = (value: string) => {
  const regex = /[0]+\.+[0]+\.+[0-9]{1,10}/gm;
  const isMatching = regex.test(value);
  if (!isMatching) throw new ParamMissingError("Wallet id is in wrong format")
  return isMatching;
};


