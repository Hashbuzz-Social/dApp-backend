import jwt, { JwtPayload } from "jsonwebtoken";
import { getPublicKey } from "@shared/KeyManager";
import { CreateAstTokenParams } from "@services/authToken-service";

// Function to verify Access Token
export const verifyAccessToken = (token: string) => {
    // Decode token header to get kid
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || typeof decodedHeader === "string") {
        throw new Error("Invalid token format");
    }

    const kid = decodedHeader.header.kid;
    if (!kid) {
        throw new Error("Access token is not valid or suspended");
    }

    const publicKey = getPublicKey(kid);
    if (!publicKey) {
        throw new Error(`Keys is not found for: ${kid}`);
    }

    // Verify token with the corresponding public key
    const payload = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
        issuer: "hashbuzz.social",
        audience: "hashbuzz-frontend",
    }) as any as CreateAstTokenParams;

    return { payload, kid };
};

// Function to verify Refresh Token (similar to Access Token)
export const verifyRefreshToken = (token: string): JwtPayload | string => {
    // Decode token header to get kid
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || typeof decodedHeader === "string") {
        throw new Error("Invalid token format");
    }

    const kid = decodedHeader.header.kid;
    if (!kid) {
        throw new Error("No kid found in token");
    }

    const publicKey = getPublicKey(kid);
    if (!publicKey) {
        throw new Error(`Public key not found for kid: ${kid}`);
    }

    // Verify token with the corresponding public key
    const payload = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
        issuer: "hashbuzz.social",
        audience: "hashbuzz-frontend",
    });

    return { payload, kid };
};
