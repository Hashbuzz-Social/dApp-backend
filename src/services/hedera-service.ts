import { AccountBalanceQuery, AccountId, Client, PrivateKey } from "@hashgraph/sdk";
import { getConfig } from "@appConfig";
import { network } from "@prisma/client"

export interface HederaClientConfig {
  hederaClient: Client;
  network: network;
  operatorAccount: string;
  operatorPrivateKey: string;
  operatorId: AccountId;
  operatorKey: PrivateKey;
  operatorPublicKey: string;
  getAccountBalances: (accountId: string) => Promise<any>;
}

async function initializeHederaClient(): Promise<HederaClientConfig> {
  const appConfig = await getConfig();
  const { network, privateKey, publicKey, accountID } = appConfig.network;

  if (!privateKey || !accountID) {
    throw new Error("Environment variables HEDERA_PRIVATE_KEY and HEDERA_ACCOUNT_ID must be present");
  }

  const operatorId = AccountId.fromString(accountID);
  
  // Try different Hedera private key formats in order of preference
  let operatorKey: PrivateKey;
  try {
    // First try the general fromString method (handles multiple formats)
    operatorKey = PrivateKey.fromString(privateKey);
  } catch (error1) {
    try {
      // Try ECDSA format for 64-character hex keys
      if (/^[0-9a-fA-F]{64}$/.test(privateKey)) {
        operatorKey = PrivateKey.fromStringECDSA(privateKey);
      } else {
        // Try DER format for longer hex strings (PKCS#8)
        operatorKey = PrivateKey.fromStringDer(privateKey);
      }
    } catch (error2) {
      try {
        // Try ED25519 format as last resort
        operatorKey = PrivateKey.fromStringED25519(privateKey);
      } catch (error3) {
        const error1Msg = error1 instanceof Error ? error1.message : String(error1);
        const error2Msg = error2 instanceof Error ? error2.message : String(error2);
        const error3Msg = error3 instanceof Error ? error3.message : String(error3);
        throw new Error(
          `Invalid private key format. Cannot parse private key using any supported Hedera format. ` +
          `Original errors: ${error1Msg}, ${error2Msg}, ${error3Msg}`
        );
      }
    }
  }

  let client: Client;
  switch (network) {
    case "mainnet":
      client = Client.forMainnet();
      break;
    case "testnet":
      client = Client.forTestnet();
      break;
    case "previewnet":
      client = Client.forPreviewnet();
      break;
    default:
      throw new Error(`Invalid HEDERA_NETWORK: ${network ?? ""}`);
  }
  client.setOperator(operatorId, operatorKey);

  const getAccountBalances = async (accountId: string) => {
    const ac = AccountId.fromString(accountId);
    const query = new AccountBalanceQuery().setAccountId(ac);
    return await query.execute(client);
  };

  return {
    hederaClient: client,
    network,
    operatorAccount: accountID,
    operatorPrivateKey: privateKey,
    operatorId,
    operatorKey,
    operatorPublicKey: publicKey,
    getAccountBalances,
  };
}



let cachedClient: HederaClientConfig | null = null;

export default async function getCachedHederaClient(): Promise<HederaClientConfig> {
  if (!cachedClient) {
    cachedClient = await initializeHederaClient();
  }
  return cachedClient;
}
