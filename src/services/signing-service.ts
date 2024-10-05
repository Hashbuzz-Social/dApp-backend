import { AccountId, PrivateKey, PublicKey, Transaction, TransactionId } from "@hashgraph/sdk";
import { proto } from "@hashgraph/proto";

import hederaService from "./hedera-service";

const signAndMakeBytes = (trans: Transaction, signingAcctId: string) => {
  const privKey = PrivateKey.fromString(hederaService.operatorPrivateKey);
  const pubKey = privKey.publicKey;

  const nodeId = [new AccountId(3)];
  const transId = TransactionId.generate(signingAcctId);

  trans.setNodeAccountIds(nodeId);
  trans.setTransactionId(transId);

  trans = trans.freeze();

  const transBytes = trans.toBytes();

  const sig = privKey.signTransaction(Transaction.fromBytes(transBytes) as any as Transaction);

  const out = trans.addSignature(pubKey, sig);

  const outBytes = out.toBytes();

  // console.log("Transaction bytes", outBytes);

  return outBytes;
};

const makeBytes = (trans: Transaction, signingAcctId: string) => {
  const transId = TransactionId.generate(signingAcctId);
  trans.setTransactionId(transId);
  trans.setNodeAccountIds([new AccountId(3)]);

  trans.freeze();

  const transBytes = trans.toBytes();

  return transBytes;
};

const signData = (data: object): { signature: Uint8Array; serverSigningAccount: string } => {
  const privKey = PrivateKey.fromString(hederaService.operatorPrivateKey);
  // const pubKey = privKey.publicKey;

  const bytes = new Uint8Array(Buffer.from(JSON.stringify(data)));

  const signature = privKey.sign(bytes);

  // let verify = pubKey.verify(bytes, signature); //this will be true

  return { signature: signature, serverSigningAccount: hederaService.operatorAccount };
};

const verifyData = (data: object, publicKey: string, signature: Uint8Array): boolean => {
  const pubKey = PublicKey.fromString(publicKey);

  const bytes = new Uint8Array(Buffer.from(JSON.stringify(data)));

  const verify = pubKey.verify(bytes, signature);

  return verify;
};

const prefixMessageToSign = (message: string) => {
  return "\x19Hedera Signed Message:\n" + message.length + message;
};

/**
 * Converts a Base64-encoded string to a `proto.SignatureMap`.
 * @param base64string - Base64-encoded string
 * @returns `proto.SignatureMap`
 */
const base64StringToSignatureMap = (base64string: string): proto.SignatureMap => {
  const encoded = Buffer.from(base64string, "base64");
  return proto.SignatureMap.decode(encoded);
};

export const verifyMessageSignature = (message: string, base64SignatureMap: string, publicKey: PublicKey): boolean => {
  const signatureMap = base64StringToSignatureMap(base64SignatureMap);
  const signature = signatureMap.sigPair[0].ed25519 || signatureMap.sigPair[0].ECDSASecp256k1;

  if (!signature) throw new Error("Signature not found in signature map");

  return publicKey.verify(Buffer.from(prefixMessageToSign(message)), signature);
};

export default {
  signAndMakeBytes,
  makeBytes,
  verifyData,
  signData,
  verifyMessageSignature,
} as const;
