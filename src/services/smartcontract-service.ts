import { contractByteCode } from "@smartContract";
import { FileCreateTransaction, Hbar, ContractCreateTransaction, AccountId, ContractExecuteTransaction, ContractFunctionParameters } from "@hashgraph/sdk";
import hederaService from "@services/hedera-service";
import prisma from "@shared/prisma";
// import JSONBigInt from "json-bigint";

const { hederaClient, operatorKey, network } = hederaService;

export const deployContract = async () => {
  console.log(contractByteCode);

  // Create a file on Hedera and store the bytecode
  const fileCreateTx = new FileCreateTransaction()
    .setContents(contractByteCode)
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
  const bytecodeFileId = fileCreateRx.fileId;

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

  return { contract_id:contract_id!.toString().trim(), addedAccount_Id: accountId, receipt: contractExReceipt };
};
// export const addCampaigner;
