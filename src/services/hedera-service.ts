import { AccountBalanceQuery, AccountId, Client, PrivateKey, TopicCreateTransaction } from "@hashgraph/sdk";
import logger from "jet-logger";
import { getConfig } from "src/appConfig";
import { network } from "@prisma/client"

interface HederaClientConfig {
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
    console.log({ privateKey, accountID });
    throw new Error("Environment variables HEDERA_PRIVATE_KEY and HEDERA_ACCOUNT_ID must be present");
  }

  const operatorId = AccountId.fromString(accountID);
  const operatorKey = PrivateKey.fromStringECDSA(privateKey);

  let client: Client;
  switch (network) {
    case "mainnet":
      logger.info("Connecting to the Hedera Mainnet");
      client = Client.forMainnet();
      break;
    case "testnet":
      logger.info("Connecting to the Hedera Testnet");
      client = Client.forTestnet();
      break;
    case "previewnet":
      logger.info("Connecting to the Hedera Previewnet");
      client = Client.forPreviewnet();
      break;
    default:
      logger.err(`Invalid HEDERA_NETWORK: ${network ?? ""}`);
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

export default initializeHederaClient;

let cachedClient: HederaClientConfig | null = null;

export async function getCachedHederaClient(): Promise<HederaClientConfig> {
  if (!cachedClient) {
    cachedClient = await initializeHederaClient();
  }
  return cachedClient;
}
