import { contractByteCode, contractAbi } from "@smartContract";
import {
  FileCreateTransaction,
  Hbar,
  ContractCreateTransaction,
  AccountId,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  Status,
  FileAppendTransaction,
  FileId,
  ContractCallQuery,
  ContractId,
} from "@hashgraph/sdk";
import hederaService from "@services/hedera-service";
import prisma from "@shared/prisma";
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
    .setGas(100000)
    .setMaxTransactionFee(20)
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
    console.log(error);
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
    console.log("Found contract in db::", contract_id);

    return { contract_id, contractAddress };
  } else {
    console.log("Intiate new contract crete::");
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

  console.log("add campigner transaction response", contractExReceipt);

  return { contract_id: contract_id!.toString().trim(), addedAccount_Id: accountId, receipt: contractExReceipt };
};
// export const addCampaigner;

/****
 * @description query balance from contract
 ***/

// const decodeFunctionResult = (functionName: string, resultAsBytes: Uint8Array) => {
//   // eslint-disable-next-line @typescript-eslint/no-unsafe-call
//   const functionAbi = contractAbi.find((func: { name: string }) => func.name === functionName);
//   const functionParameters = functionAbi?.outputs;
//   const resultHex = "0x".concat(Buffer.from(resultAsBytes).toString("hex"));
//   // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
//   const result = web3.eth.abi.decodeParameters(functionParameters, resultHex);
//   return result;
// };

export const queryBalance = async (address: string) => {
  // Execute the contract to check changes in state variable
  address = AccountId.fromString(address).toString();

  const { contract_id } = await provideActiveContract();
  // console.log(address);
  if (contract_id) {
    const contractAddress = ContractId.fromString(contract_id.toString());

    const contractCallQuery = new ContractCallQuery()
      .setContractId(contractAddress)
      .setGas(1000000)
      .setFunction("getBalance", new ContractFunctionParameters().addAddress(address))
      .setMaxQueryPayment(new Hbar(2));

    const qResult = await contractCallQuery.execute(hederaClient);
    console.log(qResult.getUint256().toNumber());
    // return decodeFunctionResult("getBalance", qResult.bytes);
    return qResult.getUint256().toNumber();
  }
};
