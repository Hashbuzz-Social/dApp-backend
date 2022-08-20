import { Client, TopicCreateTransaction } from "@hashgraph/sdk";

const network = process.env.HEDERA_NETWORK;
const operatorPrivateKey = process.env.HEDERA_PRIVATE_KEY;
const operatorAccount = process.env.HEDERA_ACCOUNT_ID;

// ===================================Set Hedera Client Details======================================

if (operatorPrivateKey == null || operatorAccount == null) {
  console.error("Environment variables HEDERA_PRIVATE_KEY and HEDERA_ACCOUNT_ID must be present");
  throw new Error("Environment variables HEDERA_PRIVATE_KEY and HEDERA_ACCOUNT_ID must be present");
}

let client: Client;
switch (network) {
  case "mainnet":
    console.log("Connecting to the Hedera Mainnet");
    client = Client.forMainnet();
    break;
  case "testnet":
    console.log("Connecting to the Hedera Testnet");
    client = Client.forTestnet();
    break;
  case "previewnet":
    console.log("Connecting to the Hedera Previewnet");
    client = Client.forPreviewnet();
    break;
  default:
    console.error("Invalid HEDERA_NETWORK: ${network}");
    throw new Error("Invalid HEDERA_NETWORK: ${network}");
}

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
  console.log("The new topic ID is " + newTopicId);
  return newTopicId;
  //v2.0.0
}

export default {
  hederaClient: client,
  network,
  operatorAccount,
  operatorPrivateKey,
};
