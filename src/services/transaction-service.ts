import { AccountId, ContractExecuteTransaction, ContractFunctionParameters, ContractId, TransferTransaction } from "@hashgraph/sdk";
import hbarservice from "@services/hedera-service";
import signingService from "@services/signing-service";
import { encodeFunctionCall, provideActiveContract } from "@services/smartcontract-service";
import { buildCampaignAddress, buildCampaigner } from "@shared/helper";
import { getCampaignDetailsById } from "./campaign-service";

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
      .setFunctionParameters(functionCallAsUint8Array)
      .setTransactionMemo("Hashbuzz balance update call")
      .setGas(1000000);
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

export const allocateBalanceToCampaign = async (campaignId: bigint | number, amounts: number, campaignerAccount: string) => {
  console.log("allocateBalanceToCampaign::start-for-campaign", campaignId);
  const { contract_id } = await provideActiveContract();

  if (contract_id) {
    const contractAddress = ContractId.fromString(contract_id.toString());
    const campaigner = buildCampaigner(campaignerAccount);
    const campaignAddress = buildCampaignAddress(campaignerAccount, campaignId.toString());

    console.log("tinyAmount is added to contract", amounts);

    // const functionCallAsUint8Array = encodeFunctionCall("addCampaign", [campaigner, campaignAddress, amounts]);
    const params = new ContractFunctionParameters().addString(campaigner).addString(campaignAddress).addUint256(amounts);

    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setFunction("addCampaign", params)
      .setTransactionMemo("Hashbuzz add balance to a campaign account"+campaignAddress)
      .setGas(10000000);

    const exResult = await contractExBalTx.execute(hbarservice.hederaClient);
    const receipt = await exResult.getReceipt(hbarservice.hederaClient);

    console.log("allocateBalanceToCampaign::finished-with-transactionId", exResult.transactionId);

    return { contract_id, transactionId: exResult.transactionId, receipt };
  } else {
    throw new Error("Contract id not found");
  }
};

export const updateCampaignBalance = async ({
  campaignerAccount,
  campaignId,
  amount,
}: {
  campaignerAccount: string;
  campaignId: string;
  amount: number;
}) => {
  const { contract_id } = await provideActiveContract();

  if (contract_id) {
    const contractAddress = ContractId.fromString(contract_id.toString());
    const campaignAddress = buildCampaignAddress(campaignerAccount, campaignId.toString());

    console.log("Update SM balances For campaign", { campaignAddress: campaignAddress.toString(), contract_id, amount });


    const params = new ContractFunctionParameters().addString(campaignAddress).addUint256(amount);

    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setFunction("payInteractorFromCampaignBalances", params)
      .setTransactionMemo("Hashbuzz subtracting campaign balance from campaign::" + campaignAddress )
      .setGas(1000000);

    const contractExecuteSubmit = await contractExBalTx.execute(hbarservice.hederaClient);
    const contractExecuteRx = await contractExecuteSubmit.getReceipt(hbarservice.hederaClient);
    return contractExecuteRx;
  }
};

export const withdrawHbarFromContract = async (intracterAccount: string, amount: number) => {
  const { contract_id } = await provideActiveContract();
  amount = amount / Math.pow(10, 8);

  console.log({ intracterAccount, contract_id, amount, amounte8: amount * 1e8 });

  if (contract_id) {
    const contractAddress = ContractId.fromString(contract_id.toString());
    const IntractorAddress = AccountId.fromString(intracterAccount).toSolidityAddress();

    //   //!! BUILD Parameters
    const functionCallAsUint8Array = encodeFunctionCall("callHbarToPayee", [IntractorAddress, Math.round(amount * 1e8)]);

    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setFunctionParameters(functionCallAsUint8Array)
      .setTransactionMemo("Hashbuzz rewarding to intractor with adderss"+ intracterAccount)
      .setGas(1000000);

    const contractExecuteSubmit = await contractExBalTx.execute(hbarservice.hederaClient);
    const contractExecuteRx = await contractExecuteSubmit.getReceipt(hbarservice.hederaClient);
    return contractExecuteRx;
  }
};


export const closeCampaignSMTransaction = async (campingId:number|bigint) =>{
  const campaignDetails = await getCampaignDetailsById(campingId);
  const {user_user , id , contract_id , name} = campaignDetails!;
  
  if(user_user?.hedera_wallet_id && contract_id && name){
    const campaigner = buildCampaigner(user_user?.hedera_wallet_id);
    const campaignAddress = buildCampaignAddress(user_user.hedera_wallet_id , id.toString());

    const contractAddress = ContractId.fromString(contract_id.trim().toString());

    const params = new ContractFunctionParameters().addString(campaigner).addString(campaignAddress);

    
    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setFunction("closeCampaign", params)
      .setTransactionMemo("Hashbuzz close campaign operation for " + name)
      .setGas(1000000);

    const contractExecuteSubmit = await contractExBalTx.execute(hbarservice.hederaClient);
    const contractExecuteRx = await contractExecuteSubmit.getReceipt(hbarservice.hederaClient);
    return contractExecuteRx;

  }
}
