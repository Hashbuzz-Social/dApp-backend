import { AccountBalanceQuery, AccountId, Client, PrivateKey, PublicKey, TopicCreateTransaction, TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import logger from "jet-logger";

const network = process.env.HEDERA_NETWORK;
const operatorPrivateKey = process.env.HEDERA_PRIVATE_KEY;
const operatorPublicKey = process.env.HEDERA_PUBLIC_KEY;
const operatorAccount = process.env.HEDERA_ACCOUNT_ID;

//build key
const operatorId = AccountId.fromString(operatorAccount!);
const operatorKey = PrivateKey.fromString(operatorPrivateKey!);

// ===================================Set Hedera Client Details======================================

if (operatorPrivateKey == null || operatorAccount == null) {
  // console.error("Environment variables HEDERA_PRIVATE_KEY and HEDERA_ACCOUNT_ID must be present");
  throw new Error("Environment variables HEDERA_PRIVATE_KEY and HEDERA_ACCOUNT_ID must be present");
}

let client: Client;
switch (network) {
  case "mainnet":
    logger.info("Connecting to the Hedera Mainnet");
    client = Client.forMainnet();
    break;
  case "testnet":
    // logger.info("Connecting to the Hedera Testnet");
    console.log("Connecting to the Hedera Testnet");
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
client = client.setOperator(operatorId, operatorKey);

/* create new async function */
async function createNewTopic() {
  //Create the transaction
  const transaction = new TopicCreateTransaction();
  //Sign with the client operator private key and submit the transaction to a Hedera network
  const txResponse = await transaction.execute(client);
  //Request the receipt of the transaction
  const receipt = await txResponse.getReceipt(client);
  //Get the topic ID
  const newTopicId = receipt.topicId;
  // console.log("The new topic ID is " + newTopicId);
  return newTopicId;
  //v2.0.0
}

const getAccountBalances = async (accountId: string) => {
  const ac = AccountId.fromString(accountId);
  //Create the account balance query
  const query = new AccountBalanceQuery().setAccountId(ac);

  //Submit the query to a Hedera network
  const accountBalance = await query.execute(client);
  return accountBalance;
};

// Create a new HCS topic if not already created
const createHcsTopic = async () => {
  const adminKey = PublicKey.fromString(operatorPublicKey!);
  const topicTransaction = new TopicCreateTransaction().setAdminKey(adminKey);
  const response = await topicTransaction.execute(client);
  const receipt = await response.getReceipt(client);
  const topicId = receipt.topicId?.toString();
  console.log("New HCS Topic ID:", topicId);
  logger.info(`New HCS Topic ID:: ${topicId}`);

  return { topicId, transaction: receipt.toJSON(), adminKey: operatorPublicKey };
};

const submiHcstMessageToTopic = async ({ topicId, message }: { topicId: string; message: string }) => {
  // Send message to private topic
  let submitMsgTx = await new TopicMessageSubmitTransaction({
    topicId,
    message,
  })
    .freezeWith(client)
    .sign(operatorKey);

  let submitMsgTxSubmit = await submitMsgTx.execute(client);
  // Get the receipt of the transaction
  let getReceipt = await submitMsgTxSubmit.getReceipt(client);
  // Get the status of the transaction
  const transactionStatus = getReceipt.status;
  console.log("The message transaction status " + transactionStatus.toString());
};

export default {
  hederaClient: client,
  network,
  operatorAccount,
  operatorPrivateKey,
  operatorId,
  operatorKey,
  operatorPublicKey,
  getAccountBalances,
  createHcsTopic,
  submiHcstMessageToTopic,
} as const;
