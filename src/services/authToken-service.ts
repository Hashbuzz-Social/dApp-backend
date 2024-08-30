import { user_user } from "@prisma/client";
import jwt from "jsonwebtoken";
const accessSecret = process.env.J_ACCESS_TOKEN_SECRET;

export const generateAdminToken = (user: user_user) => {
  const { id, role , hedera_wallet_id } = user;
  return jwt.sign({ id: id.toString(), hedera_wallet_id , role }, accessSecret!, { expiresIn: "24h" });
};

export const generateSigningToken = () => {
  const currentTimeStamp = new Date().getTime();
  return jwt.sign({ ts: currentTimeStamp }, accessSecret!, { expiresIn: "30s" });
};

/**
 * Parameters for creating an AST token.
 */
interface CreateAstTokenParams {
  /**
   * Current timestamp.
   */
  ts: number;

  /**
   * Server-generated signature.
   */
  signature: string;

  /**
   * Client account ID from which the client had signed the signature.
   */
  accountId: string;
}

/**
 * 
 * @param CreateAstTokenParams
 * @returns string 
 */

export const createAstToken = (params: CreateAstTokenParams) => {
  return jwt.sign(params, accessSecret!, { expiresIn: "24h" });
};
