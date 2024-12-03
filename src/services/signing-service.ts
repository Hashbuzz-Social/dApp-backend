import { AccountId, PrivateKey, PublicKey, Transaction, TransactionId } from "@hashgraph/sdk";

import initHederaService from "./hedera-service";

const signAndMakeBytes = async (trans: Transaction, signingAcctId: string) => {
  const hederaService = await initHederaService();

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

const signData = async (data: object): Promise<{ signature: Uint8Array; serverSigningAccount: string }> => {
  const hederaService = await initHederaService();
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

export default {
  signAndMakeBytes,
  makeBytes,
  verifyData,
  signData,
} as const;
