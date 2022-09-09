import { ContractExecuteTransaction, Hbar, ContractFunctionParameters, AccountId, ContractId, TransferTransaction } from "@hashgraph/sdk";
import { encodeFunctionCall, provideActiveContract } from "@services/smartcontract-service";
import signingService from "@services/signing-service";
import hbarservice from "@services/hedera-service";

export const updateBalanceToContract = async (payerId: string, amount: number) => {
  const { contract_id } = await provideActiveContract();

  if (contract_id) {
    const address = "0x" + AccountId.fromString(payerId).toSolidityAddress();
    const contractAddress = ContractId.fromString(contract_id.toString());
    const tinyAmount = parseInt(((amount - amount * 0.1) * Math.pow(10, 8)).toFixed(0));
    const deposit = true;

    console.log("tinyAmount is added to contract", tinyAmount);

    const functionCallAsUint8Array = encodeFunctionCall("updateBalance", [address, tinyAmount, deposit]);

    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(1000000)
      .setFunctionParameters(functionCallAsUint8Array)
      .setTransactionMemo("Hashbuzz balance update call")
      .setGas(100000);
    const exResult = await contractExBalTx.execute(hbarservice.hederaClient);
    return { transactionId: exResult.transactionId, recipt: exResult.getReceipt(hbarservice.hederaClient) };
    // return signingService.signAndMakeBytes(contractExBalTx, payerId);
  } else {
    throw new Error("Contract id not found");
  }
};

export const createTopUpTransaction = async (payerId: string, amount: number) => {
  const { contract_id } = await provideActiveContract();
  const amountToContract = parseFloat((amount - amount * 0.1).toFixed(8));
  const amountToOperator = parseFloat((amount * 0.1).toFixed(8));
  if (contract_id) {
    const transferTx = new TransferTransaction()
      .addHbarTransfer(payerId, -amount)
      .addHbarTransfer(contract_id?.toString(), amountToContract)
      .addHbarTransfer(hbarservice.operatorId, amountToOperator);

    //signing and returning
    return signingService.signAndMakeBytes(transferTx, payerId);
  } else {
    throw new Error("Contract id not found");
  }
};
