import { user_user } from "@prisma/client";
import jwt from "jsonwebtoken";
const accessSecret = process.env.J_ACCESS_TOKEN_SECRET;
import { v4 as uuidv4 } from "uuid";
import { getCurrentKeyPair } from "@shared/KeyManager";

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

  /**
   * user db id
   */

  id: string;
}

export const generateAdminToken = (user: user_user) => {
  const { id, role, hedera_wallet_id } = user;
  return jwt.sign({ id: id.toString(), hedera_wallet_id, role }, accessSecret!, { expiresIn: "24h" });
};

export const generateSigningToken = () => {
  const currentTimeStamp = new Date().getTime();
  return jwt.sign({ ts: currentTimeStamp }, accessSecret!, {
    algorithm: "HS512", // or RS256 for asymmetrical keys
    expiresIn: "5m", // Keep this short for high-security requirements
  });
};

/**
 *
 * @param CreateAstTokenParams
 * @returns string
 */

export const createAstTokenEx = (params: CreateAstTokenParams) => {
  return jwt.sign(params, accessSecret!, { expiresIn: "24h" });
};

export const genrateRefreshTokenEx = (params: CreateAstTokenParams) => {
  return jwt.sign(params, accessSecret!, { expiresIn: "7d" });
};

/**
 * @description Function to create AST token with secure way
 * @param payload [CreateAstTokenParams]
 * @returns token [JWT Token]
 */
export const createAstToken = (payload: CreateAstTokenParams): string => {
  const currentKey = getCurrentKeyPair();

  const token = jwt.sign(
    {
      ...payload,
      jti: uuidv4(), // Unique identifier for the token
    },
    currentKey.privateKey,
    {
      algorithm: "RS256",
      expiresIn: "24h",
      issuer: "hashbuzz.social",
      audience: "hashbuzz-frontend",
      header: {
        kid: currentKey.kid, // Key Identifier
        alg: "RS256", // Algorithm
      },
    }
  );

  return token;
};

/**
 * @description Function to create AST token with secure way
 * @param payload [CreateAstTokenParams]
 * @returns token [JWT Token]
 */
export const genrateRefreshToken = (payload: CreateAstTokenParams): string => {
  const currentKey = getCurrentKeyPair();

  const refreshToken = jwt.sign(
    {
      ...payload,
      jti: uuidv4(),
    },
    currentKey.privateKey,
    {
      algorithm: "RS256",
      expiresIn: "7d",
      issuer: "hashbuzz.social",
      audience: "hashbuzz-frontend",
      header: {
        kid: currentKey.kid,
        alg: "RS256", // Algorithm
      },
    }
  );

  return refreshToken;
};
