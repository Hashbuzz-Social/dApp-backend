import { AccountId, ContractExecuteTransaction, ContractFunctionParameters, TokenInfoQuery, TransactionRecord } from "@hashgraph/sdk";
import hederaService from "@services/hedera-service";
import { nodeURI } from "@shared/helper";
import prisma from "@shared/prisma";
import Web3 from "web3";
import { provideActiveContract } from "./smartcontract-service";

const web3 = new Web3();

const { hederaClient, operatorKey } = hederaService;

const getTokenInfo = async (tokenId: string) => {
  const query = new TokenInfoQuery().setTokenId(tokenId);

  //Sign with the client operator private key, submit the query to the network and get the token supply
  const info = await query.execute(hederaClient);
  return info;
};

/**
 * Decodes event contents using the ABI definition of the event
 * @param eventName the name of the event
 * @param log log data as a Hex string
 * @param topics an array of event topics
 */
const decodeEvent = (eventName: string, log: string, topics: string[]) => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //@ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const eventAbi = logicalContractAbi.find((event) => event.name === eventName && event.type === "event");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const decodedLog = web3.eth.abi.decodeLog(eventAbi.inputs, log, topics);
  return decodedLog;
};

/** Read event from the transaction record */

const logEventsRecords = (record: TransactionRecord) => {
  // the events from the function call are in record.contractFunctionResult.logs.data
  // let's parse the logs using web3.js
  // there may be several log entries
  record.contractFunctionResult?.logs.forEach((log) => {
    // convert the log.data (uint8Array) to a string
    const logStringHex = "0x".concat(Buffer.from(log.data).toString("hex"));

    // get topics from log
    const logTopics: string[] = [];
    log.topics.forEach((topic) => {
      logTopics.push("0x".concat(Buffer.from(topic).toString("hex")));
    });

    // decode the event data
    const event = decodeEvent("SetMessage", logStringHex, logTopics.slice(1));

    // output the from address stored in the event
    console.log(`Record event: from '${AccountId.fromSolidityAddress(event.from).toString()}' update to '${event.message}'`);
  });
};

/**
 * Associates a token with the active contract.
 *
 * @param tokenId - The ID of the token to associate.
 * @returns An object containing the transaction receipt and status.
 */
const associateTokenToContract = async (tokenId: string) => {
  // Retrieve the ID of the active contract.
  const contractDetails = await provideActiveContract();

  // Convert the token ID to a Solidity address.
  const tokenAddress = AccountId.fromString(tokenId).toSolidityAddress();

  if (contractDetails?.contract_id) {
    // Create a new ContractExecuteTransaction to associate the token with the contract.
    const associateToken = new ContractExecuteTransaction()
      .setContractId(contractDetails.contract_id)
      .setGas(2000000)
      .setFunction("associateToken", new ContractFunctionParameters().addUint8(1).addAddress(tokenAddress));

    // Execute the transaction and retrieve the receipt.
    const contractCallResult = await associateToken.execute(hederaClient);
    const associateTokenRx = await contractCallResult.getReceipt(hederaClient);

    // Retrieve the transaction status and log it to the console.
    const associateTokenStatus = associateTokenRx.status;
    console.log(" - The Contract associate transaction status:" + associateTokenStatus);

    const record = await contractCallResult.getRecord(hederaClient);
    logEventsRecords(record);

    // Return an object containing the transaction receipt and status.
    return { associateTokenRx, status: associateTokenStatus };
  }
};

const getEntityDetailsByTokenId = async (token_id: string) => {
  const entityData = await prisma.whiteListedTokens.findUnique({ where: { token_id } });
  return entityData;
};


const getTokenDetails = async (tokenID: string): Promise<any> => {
  const TOKEN_INFO_URI = `${nodeURI}/api/v1/tokens/${tokenID}`;
  if (!tokenID) throw new Error("Account id not defined !");

  const req = await fetch(TOKEN_INFO_URI);
  const data = await req.json();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return data;
};

export default { getTokenInfo, associateTokenToContract, getEntityDetailsByTokenId, getTokenDetails };

