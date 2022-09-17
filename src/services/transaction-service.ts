import {
  ContractExecuteTransaction,
  Hbar as Hban,
  ContractFunctionParameters,
  AccountId,
  ContractId,
  TransferTransaction,
  ContractCallQuery,
  Hbar,
} from "@hashgraph/sdk";
import { decodeFunctionResult, encodeFunctionCall, provideActiveContract } from "@services/smartcontract-service";
import signingService from "@services/signing-service";
import hbarservice from "@services/hedera-service";

export const updateBalanceToContract = async (payerId: string, amounts: { topUpAmount: number; fee: number; total: number }) => {
  const { contract_id } = await provideActiveContract();

  if (contract_id) {
    const address = "0x" + AccountId.fromString(payerId).toSolidityAddress();
    const contractAddress = ContractId.fromString(contract_id.toString());
    const deposit = true;

    console.log("tinyAmount is added to contract", amounts.topUpAmount);

    const functionCallAsUint8Array = encodeFunctionCall("updateBalance", [address, amounts.topUpAmount, deposit]);

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

export const createTopUpTransaction = async (payerId: string, amounts: { topUpAmount: number; fee: number; total: number }) => {
  const { contract_id } = await provideActiveContract();
  if (contract_id) {
    const transferTx = new TransferTransaction()
      .addHbarTransfer(payerId, -amounts.total / Math.pow(10, 8))
      .addHbarTransfer(contract_id?.toString(), amounts.topUpAmount / Math.pow(10, 8))
      .setTransactionMemo("Hashbuzz contract payment")
      .addHbarTransfer(hbarservice.operatorId, amounts.fee / Math.pow(10, 8))
      .setTransactionMemo("Hashbuzz escrow payment");

    //signing and returning
    return signingService.signAndMakeBytes(transferTx, payerId);
  } else {
    throw new Error("Contract id not found");
  }
};

/****
 * @description - This function will be called after creating campaign. Calling this function will debit balance
 * from the campaigner hedera account and credit same balance to the campaign account.
 *
 * @params campaignerAccount - Campaigner account address in 0.0.123456 format.
 * @params campaignerId - Database id of the campaign
 * @params amounts - Amount which is allocated to the campaign in tinybar.
 */

export const allocateBalanceToCampaign = async (campaignerId: bigint, amounts: number, campaignerAccount: string) => {
  const { contract_id } = await provideActiveContract();

  if (contract_id) {
    const campaigner = "0x" + AccountId.fromString(campaignerAccount).toSolidityAddress();
    const contractAddress = ContractId.fromString(contract_id.toString());

    const campaignAddress = campaigner + "_" + campaignerId.toString();

    console.log("tinyAmount is added to contract", amounts);

    const functionCallAsUint8Array = encodeFunctionCall("addCampaign", [campaigner, campaignAddress, amounts]);

    const contractExBalTx = new ContractCallQuery()
      .setContractId(contractAddress)
      .setGas(1000000)
      .setFunction("abc", new ContractFunctionParameters())
      .setFunctionParameters(functionCallAsUint8Array)
      .setQueryPayment(new Hbar(1));

    const exResult = await contractExBalTx.execute(hbarservice.hederaClient);
    const balances = exResult.getUint256(0).toString();
    const balancesObj = decodeFunctionResult("getBalance", exResult.bytes);
    // return { transactionId: exResult.transactionId, recipt: exResult.getReceipt(hbarservice.hederaClient) };
    // return signingService.signAndMakeBytes(contractExBalTx, payerId);
    return { balances, balancesObj };
  } else {
    throw new Error("Contract id not found");
  }
};
