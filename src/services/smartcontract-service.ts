import { AccountId, ContractCallQuery, ContractCreateFlow, ContractCreateTransaction, ContractExecuteTransaction, ContractFunctionParameters, ContractId, FileAppendTransaction, FileCreateTransaction, FileId, Hbar, Status } from "@hashgraph/sdk";
import hederaService from "@services/hedera-service";
import { buildCampaignAddress } from "@shared/helper";
import prisma from "@shared/prisma";
import { contractAbi, contractByteCode, logicalContractByteCode, proxyContractByteCode } from "@smartContract";
import logger from "jet-logger";
import Web3 from "web3";
import { getCampaignDetailsById } from "./campaign-service";

const web3 = new Web3();
// import JSONBigInt from "json-bigint";
const { hederaClient, operatorKey, network, operatorId } = hederaService;

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

const uploadFile = async (contractByteCode: Buffer) => {
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

  const fileCreateTx = new FileCreateTransaction().setContents(firstPartBytes).setKeys([operatorKey]).setMaxTransactionFee(new Hbar(20)).setFileMemo("Hashbuzz smartcontract file.").setTransactionMemo("Hashbuzz file create transaction").freezeWith(hederaClient);

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

export const deployContract = async (byteCode: Buffer) => {
  try {
    const bytecodeFileId = (await uploadFile(byteCode)).fileId;

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    // console.log(`- The bytecode file ID is: ${bytecodeFileId} \n`);

    // Instantiate the smart contract
    const contractInstantiateTx = new ContractCreateTransaction().setBytecodeFileId(bytecodeFileId!).setGas(5000000).setConstructorParameters(new ContractFunctionParameters().addAddress(operatorId.toSolidityAddress())).setMaxTransactionFee(20).setAdminKey(operatorKey).setContractMemo("Hashbuzz contract").setTransactionMemo("Hashbuzz contract deploy transaction");

    const contractInstantiateSubmit = await contractInstantiateTx.execute(hederaClient);

    const contractInstantiateRx = await contractInstantiateSubmit.getReceipt(hederaClient);

    const contractId = contractInstantiateRx.contractId;
    const contractAddress = contractId?.toSolidityAddress();

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    console.log(`- The smart contract ID is: ${contractId} \n`);
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    console.log(`- Smart contract ID in Solidity format: ${contractAddress} \n`);

    // await prisma.smartcontracts.create({
    //   data: {
    //     // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    //     contract_id: `${contractId}`.trim(),
    //     network,
    //     created_at: new Date().toISOString(),
    //     // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    //     contractAddress: `${contractAddress?.toString()}`,
    //     // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    //     fileId: `${bytecodeFileId?.toString()}`,
    //   },
    // });
    return { contract_id: contractId, contractAddress, fileId: bytecodeFileId };
  } catch (error) {
    console.log("Error: form deploy contract");
    logger.err(error);
    throw error;
  }
};

/** Smart contract transaction */
const deployContractTrnx = async (byteCode: Buffer, contraParams: ContractFunctionParameters) => {
  /////////////////////DEPLOY THE SMART CONTRACT ////////////////////////////////
  const createContract = new ContractCreateFlow()
    .setGas(5000000)
    .setBytecode(byteCode)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    .setConstructorParameters(contraParams)
    // new ContractFunctionParameters().addAddress(operatorId.toSolidityAddress()))
    .setAdminKey(operatorKey);
  const createSubmit = await createContract.execute(hederaClient);
  const createRx = await createSubmit.getReceipt(hederaClient);
  return createRx;
};

export const deployContractNew = async () => {
  const hashbuzz = process.env.HASHBUZZ_CONTRACT_ADDRESS;
  const availableContracts = await prisma.smartcontracts.findMany({
    where: {
      is_active: true,
      network,
    },
  });

  if (availableContracts.length === 0 && hashbuzz) {
    const { contract_id, contractAddress, logicalContract_id } = await prisma.smartcontracts.create({
      data: {
        contractAddress: hashbuzz,
        contract_id: `${hashbuzz}`,
        logicalContract_id: `${hashbuzz}`,
        lcFileID: hashbuzz ?? "",
        network,
        fileId: hashbuzz ?? "",
        created_at: new Date().toISOString(),
      },
    });
  }

  // else {
  //   console.log("deployContractNew::->");
  //   try {
  //     //!! Step 1 deploy logical contract first;
  //     console.log("contract bytecode")
  //     const logocaContractDetails = await deployContract(backupContractByteCode);
  //     const logicalContract_id = logocaContractDetails.contract_id;
  //     const lcFileID = logocaContractDetails.fileId?.toString();
  //     console.log("Logical contract deployed successfully with logical_contract_id::", logicalContract_id);

  //     if (logicalContract_id) {
  //       // const proxyContractParams = new ContractFunctionParameters();
  //       // proxyContractParams.addAddress(logicalContract_id.toSolidityAddress()); // setLogical contract address as params;
  //       // proxyContractParams.addAddress(operatorId.toSolidityAddress()); // Admin address as params;

  //       // const proxyContractTrx = await deployContractTrnx(proxyContractByteCode, proxyContractParams);
  //       // const proxyContractId = proxyContractTrx.contractId;
  //       // const fileId = proxyContractTrx.fileId?.toString();

  //       await prisma.smartcontracts.create({
  //         data: {
  //           contractAddress: logicalContract_id?.toSolidityAddress() ?? "",
  //           // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  //           contract_id: `${logicalContract_id}`,
  //           // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  //           logicalContract_id: `${logicalContract_id}`,
  //           lcFileID: lcFileID ?? "",
  //           network,
  //           fileId: lcFileID ?? "",
  //           created_at: new Date().toISOString(),
  //         },
  //       });

  //       console.log(" - The new contract ID is " + logicalContract_id);

  //       const contractDetails = { contract_id: logicalContract_id, contractAddress: logicalContract_id?.toSolidityAddress() };

  //       return contractDetails;
  //     }
  //   } catch (err) {
  //     logger.err(err);
  //     throw err;
  //   }
  // }
};

export const provideActiveContract = async () => {
  const availableContracts = await prisma.smartcontracts.findMany({
    where: {
      is_active: true,
      network,
    },
  });
  if (availableContracts.length > 0) {
    const { contract_id, contractAddress, logicalContract_id } = availableContracts[0];
    // console.log("Found contract in db::", contract_id);

    return { contract_id, contractAddress, logicalContract_id };
  }
  // else {
  //   logger.info("Intiate new contract crete::");
  //   return await deployContractNew();
  // }
};

export const addCampaigner = async (accountId: string, user_id?: bigint) => {
  // Create Address
  const address: string = AccountId.fromString(accountId).toSolidityAddress();

  // get contract_id
  const activeContract = await provideActiveContract();
  if (activeContract?.contract_id) {
    const contractParams = new ContractFunctionParameters();
    contractParams.addAddress(address);

    // Execute the contract to check changes in state variable
    const contractExTx = new ContractExecuteTransaction()
      .setContractId(activeContract.contract_id.toString().trim())
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

    return { contract_id: activeContract.contract_id.toString().trim(), addedAccount_Id: accountId, receipt: contractExReceipt };
  }
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

  const contractDetails = await provideActiveContract();
  if (contractDetails?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());
    const getBalance = new ContractCallQuery().setContractId(contractAddress).setGas(2000000).setFunction("getBalance", new ContractFunctionParameters().addAddress(address)).setQueryPayment(new Hbar(10));

    const contractCallResult = await getBalance.execute(hederaClient);
    const getBalanceRx = contractCallResult.getUint256();
    console.log(" - The Balance of HBar token Campaigner " + getBalanceRx);
    const balances = getBalanceRx.toString();

    return { balances };
    //
    // console.log(balances, "-------");
    // const balancesObj = decodeFunctionResult("getBalance", qResult.bytes);
    // return { balances, balancesObj };
    // return qResult.getUint256(0);
  }
};

export const queryFungibleBalance = async (address: string, fungible_tokenId: string) => {
  address = AccountId.fromString(address).toSolidityAddress();
  const tokenId = AccountId.fromString(fungible_tokenId);

  const contractDetails = await provideActiveContract();
  if (contractDetails?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());
    const getBalance = new ContractCallQuery().setContractId(contractAddress).setGas(2000000).setFunction("getFungibleAndNFTBalance", new ContractFunctionParameters().addAddress(address).addAddress(tokenId.toSolidityAddress())).setQueryPayment(new Hbar(10));

    const contractCallResult = await getBalance.execute(hederaClient);
    const getBalanceRx = contractCallResult.getUint256();
    console.log(" - The Balance of fungible token Campaigner " + getBalanceRx);
    const balances = getBalanceRx.toString();

    return balances;
  }
};

/****
 * @description query campaign balance from contract
 ***/

export const queryCampaignBalance = async (address: string, campaignId: number | bigint) => {
  const card = await getCampaignDetailsById(campaignId);
  logger.info("payment enquiry for campaignAddress::: " + card?.contract_id);

  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id && card?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());
    const tokenId = AccountId.fromString(card?.fungible_token_id as string);

    const getBalance = new ContractCallQuery().setContractId(contractAddress).setGas(2000000).setFunction("getFungibleAndNFTCampaignBalance", new ContractFunctionParameters().addString(card.contract_id).addAddress(tokenId.toSolidityAddress())).setQueryPayment(new Hbar(10));

    const contractCallResult = await getBalance.execute(hederaClient);
    const getBalanceRx = contractCallResult.getUint256();
    logger.info(`- The Campaign fungible Balance  for cmapign ${card.id} ::: ${getBalanceRx.toString()}`);

    return { balances: getBalanceRx };
  }
};

export const addUserToContractForHbar = async (user_wallet_id: string, userId: bigint) => {
  console.log("addUserToContractForHbar:::->user_wallet_id", user_wallet_id);

  const user = await prisma.user_user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user?.whitelistUser) {
    const contractDetails = await provideActiveContract();
    const address = AccountId.fromString(user_wallet_id);
    console.log(contractDetails, "------", user_wallet_id);

    if (contractDetails?.contract_id) {
      // const backupContract = contractDetails?.contract_id;
      // const contractAddress = ContractId.fromString(backupContract.toString());

      // const addUser = new ContractExecuteTransaction()
      //   .setContractId(contractAddress)
      //   .setGas(400000)
      //   .setFunction("addUser", new ContractFunctionParameters().addAddress(address.toSolidityAddress()))
      //   .setTransactionMemo(`Add user ${user_wallet_id} to contract `);

      // const addUserTx = await addUser.execute(hederaClient);
      // const addUserRx = await addUserTx.getReceipt(hederaClient);
      // const addUserStatus = addUserRx.status;

      await prisma.user_user.update({
        where: {
          id: userId,
        },
        data: {
          whitelistUser: true,
        },
      });

      // console.log(" - Add user transaction status: " + addUserStatus);

      return true;
    }
  }

  return true;
};

export const getSMInfo = async () => {
  const activeContract = await provideActiveContract();
  //Create the query
  // const query = new ContractInfoQuery().setContractId(contract_id!);

  // //Sign the query with the client operator private key and submit to a Hedera network
  // const info = await query.execute(hederaClient);
  // console.log(info);
  // console.log(info.adminKey);

  return activeContract;
};
