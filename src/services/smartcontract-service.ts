import {
  AccountId,
  ContractCallQuery,
  ContractCreateTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  FileAppendTransaction,
  FileCreateTransaction,
  FileId,
  Hbar,
  Status,
  ContractInfoQuery,
  Key,
} from "@hashgraph/sdk";
import hederaService from "@services/hedera-service";
import { buildCampaignAddress } from "@shared/helper";
import prisma from "@shared/prisma";
import { contractAbi, contractByteCode } from "@smartContract";
import logger from "jet-logger";
import Web3 from "web3";

const web3 = new Web3();
// import JSONBigInt from "json-bigint";
const { hederaClient, operatorKey, network } = hederaService;

const copyBytes = (start: number, length: number, bytes: Buffer) => {
  console.debug("contractDeploy :: copyBytes");

  const newUint = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    newUint[i] = bytes[start + i];
  }
  return newUint;
};

async function appendFile(fileId: string | FileId, contents: string | Uint8Array, memo = " Composer File Append") {
  let transactionId;

  try {
    transactionId = await new FileAppendTransaction()
      .setFileId(fileId)
      .setContents(contents)
      // .setMaxTransactionFee(txFee)
      .execute(hederaClient);
  } catch (error) {
    transactionId = await new FileAppendTransaction()
      .setFileId(fileId)
      .setContents(contents)
      // .setMaxTransactionFee(txFee)
      .setTransactionMemo(memo)
      .execute(hederaClient);
  }

  // FileCreateTransaction modifyMaxTransactionFee = transactionId.setMaxTransactionFee(new Hbar(2));

  const response = await transactionId.getReceipt(hederaClient);

  // console.verbose(response)
  return response;
}

const uploadFile = async () => {
  const FILE_PART_SIZE = 2800; // 3K bytes
  const numParts = Math.floor(contractByteCode.length / FILE_PART_SIZE);
  let remainder = contractByteCode.length % FILE_PART_SIZE;
  let firstPartBytes = null;
  let moreContents = false;

  if (contractByteCode.length <= FILE_PART_SIZE) {
    firstPartBytes = contractByteCode;
    remainder = 0;
  } else {
    moreContents = true;
    firstPartBytes = copyBytes(0, FILE_PART_SIZE, contractByteCode);
  }

  const fileCreateTx = new FileCreateTransaction()
    .setContents(firstPartBytes)
    .setKeys([operatorKey])
    .setMaxTransactionFee(new Hbar(20))
    .setFileMemo("Hashbuzz smartcontract file.")
    .setTransactionMemo("Hashbuzz file create transaction")
    .freezeWith(hederaClient);

  // Sign for create file
  const fileCreateSign = await fileCreateTx.sign(operatorKey);

  //file create transaction
  const fileCreateSubmit = await fileCreateSign.execute(hederaClient);

  //flie create response
  const fileCreateRx = await fileCreateSubmit.getReceipt(hederaClient);

  //bytecodeFileId
  const fileId = fileCreateRx.fileId;

  if (moreContents) {
    // console.silly("Appending File")
    if (fileCreateRx.status._code === Status.Success._code) {
      for (let i = 1; i < numParts; i++) {
        const partBytes = copyBytes(i * FILE_PART_SIZE, FILE_PART_SIZE, contractByteCode);
        const fileAppendResult = await appendFile(fileId!, partBytes);
        // console.log('File Append Result : ', i, fileAppendResult)
        if (fileAppendResult.status._code !== Status.Success._code) {
          throw new Error("Error Appending File");
        }
      }
      if (remainder > 0) {
        const partBytes = copyBytes(numParts * FILE_PART_SIZE, remainder, contractByteCode);
        const fileAppendResult = await appendFile(fileId!, partBytes);
        // console.log('Remainder File Append Result : ', fileAppendResult)
        if (fileAppendResult.status._code !== Status.Success._code) {
          throw new Error("Error Appending Last Chunks");
        }
      }
    }
  }

  return fileCreateRx;
};

export const deployContract = async () => {
  const bytecodeFileId = (await uploadFile()).fileId;

  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  console.log(`- The bytecode file ID is: ${bytecodeFileId} \n`);

  // Instantiate the smart contract
  const contractInstantiateTx = new ContractCreateTransaction()
    .setBytecodeFileId(bytecodeFileId!)
    .setGas(2000000)
    .setMaxTransactionFee(20)
    .setAdminKey(operatorKey)
    .setContractMemo("Hashbuzz smart contract")
    .setTransactionMemo("Hashbuzz contract deploy transaction");

  const contractInstantiateSubmit = await contractInstantiateTx.execute(hederaClient);

  const contractInstantiateRx = await contractInstantiateSubmit.getReceipt(hederaClient);

  const contractId = contractInstantiateRx.contractId;
  const contractAddress = contractId?.toSolidityAddress();

  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  console.log(`- The smart contract ID is: ${contractId} \n`);
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  console.log(`- Smart contract ID in Solidity format: ${contractAddress} \n`);

  try {
    await prisma.smartcontracts.create({
      data: {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        contract_id: `${contractId}`.trim(),
        network,
        created_at: new Date().toISOString(),
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        contractAddress: `${contractAddress?.toString()}`,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        fileId: `${bytecodeFileId?.toString()}`,
      },
    });
  } catch (error) {
    logger.err(error);
  }

  return { contract_id: contractId, contractAddress };
};

export const provideActiveContract = async () => {
  const availableContracts = await prisma.smartcontracts.findMany({
    where: {
      is_active: true,
      network,
    },
  });

  if (availableContracts.length > 0) {
    const { contract_id, contractAddress } = availableContracts[0];
    // console.log("Found contract in db::", contract_id);

    return { contract_id, contractAddress };
  } else {
    logger.info("Intiate new contract crete::");
    return await deployContract();
  }
};

export const addCampaigner = async (accountId: string, user_id?: bigint) => {
  // Create Address
  const address: string = AccountId.fromString(accountId).toSolidityAddress();

  // get contract_id
  const { contract_id } = await provideActiveContract();

  const contractParams = new ContractFunctionParameters();
  contractParams.addAddress(address);

  // Execute the contract to check changes in state variable
  const contractExTx = new ContractExecuteTransaction()
    .setContractId(contract_id!.toString().trim())
    .setGas(1000000)
    .setFunction("addCampaigner", contractParams)
    .setTransactionMemo(
      "Hashbuzz-transaction" +
        JSON.stringify({
          transactionFor: "addCampaigner",
          user_id: user_id?.toString(),
          wallet_id: accountId.toString(),
        })
    );

  const contractExSubmit = await contractExTx.execute(hederaClient);

  //recipt;
  const contractExReceipt = await contractExSubmit.getReceipt(hederaClient);

  // console.log("add campigner transaction response", contractExReceipt);

  return { contract_id: contract_id!.toString().trim(), addedAccount_Id: accountId, receipt: contractExReceipt };
};
// export const addCampaigner;

/**
 * Decodes the result of a contract's function execution
 * @param functionName the name of the function within the ABI
 * @param resultAsBytes a byte array containing the execution result
 */
export function decodeFunctionResult(functionName: string, resultAsBytes: Uint8Array) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const functionAbi = contractAbi.find((func: { name: string }) => func.name === functionName);
  const functionParameters = functionAbi.outputs;
  const resultHex = "0x".concat(Buffer.from(resultAsBytes).toString("hex"));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const result = web3.eth.abi.decodeParameters(functionParameters, resultHex);
  return result;
}

/**
 * Encodes a function call so that the contract's function can be executed or called
 * @param functionName the name of the function to call
 * @param parameters the array of parameters to pass to the function
 */
export function encodeFunctionCall(functionName: string, parameters: any[]) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const functionAbi = contractAbi.find((func: { name: string; type: string }) => func.name === functionName && func.type === "function");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const encodedParametersHex = web3.eth.abi.encodeFunctionCall(functionAbi, parameters).slice(2);
  return Buffer.from(encodedParametersHex, "hex");
}

/****
 * @description query balance from contract
 ***/

export const queryBalance = async (address: string) => {
  // Execute the contract to check changes in state variable
  address = AccountId.fromString(address).toSolidityAddress();

  const { contract_id } = await provideActiveContract();
  if (contract_id) {
    const contractCallQuery = new ContractCallQuery()
      .setContractId(contract_id.toString())
      .setGas(100000)
      .setFunction("getBalance", new ContractFunctionParameters().addString(address))
      .setQueryPayment(new Hbar(1));

    const qResult = await contractCallQuery.execute(hederaClient);
    const balances = qResult.getUint256(0).toString();
    const balancesObj = decodeFunctionResult("getBalance", qResult.bytes);
    return { balances, balancesObj };
    // return qResult.getUint256(0);
  }
};

/****
 * @description query campaign balance from contract
 ***/

export const queryCampaignBalance = async (address: string, campaignId: number | bigint) => {
  // Execute the contract to check changes in state variable
  const campaignAddress = buildCampaignAddress(address, campaignId.toString());
  logger.info("payment enquiry for campaignAddress::: " + campaignAddress);
  const { contract_id } = await provideActiveContract();
  if (contract_id) {
    const contractCallQuery = new ContractCallQuery()
      .setContractId(contract_id.toString())
      .setGas(100000)
      .setFunction("getCampaignBalance", new ContractFunctionParameters().addString(campaignAddress))
      .setQueryPayment(new Hbar(1));

    const qResult = await contractCallQuery.execute(hederaClient);
    const balances = qResult.getUint256(0).toString();
    const balancesObj = decodeFunctionResult("getBalance", qResult.bytes);
    return { balances, balancesObj };
    // return qResult.getUint256(0);
  }
};

export const addUserToContractForHbar = async (user_wallet_id: string) => {
  const { contract_id } = await provideActiveContract();
  const address = AccountId.fromString(user_wallet_id).toSolidityAddress();
  if (contract_id) {
    const addUser = new ContractExecuteTransaction()
      .setContractId(contract_id)
      .setGas(400000)
      .setFunction("addUser", new ContractFunctionParameters().addAddress(address))
      .setTransactionMemo(`Add user ${user_wallet_id} to contract `);

    const addUserTx = await addUser.execute(hederaClient);
    const addUserRx = await addUserTx.getReceipt(hederaClient);
    const addUserStatus = addUserRx.status;

    console.log(" - Add user transaction status: " + addUserStatus);

    return addUserStatus;
  }
};

export const getSMInfo = async () => {
  const { contract_id } = await provideActiveContract();
  //Create the query
  const query = new ContractInfoQuery().setContractId(contract_id!);

  //Sign the query with the client operator private key and submit to a Hedera network
  const info = await query.execute(hederaClient);
  console.log(info);
  console.log(info.adminKey);

  return info;
};

