import { AccountId, ContractExecuteTransaction, ContractId, TransferTransaction, ContractFunctionParameters, Hbar } from "@hashgraph/sdk";
import hederaService from "@services/hedera-service";
import hbarservice from "@services/hedera-service";
import signingService from "@services/signing-service";
import { encodeFunctionCall, provideActiveContract } from "@services/smartcontract-service";
import prisma from "@shared/prisma";

/***
 *@params  campaignerAddresses - Hedera wallet address in format 0.0.024568;
 *@returns campaigner - a string that will used to store the records on smartcontrct machine.
 */
const buildCampaigner = (campaignerAddresses: string) => {
  const campaigner = "0x" + AccountId.fromString(campaignerAddresses).toSolidityAddress();
  return campaigner;
};

/***
 *@params  campaignerAddresses - Hedera wallet address in format 0.0.024568;
 *@returns campaignAddress - An unique string which will act like id in the smartcontrct for storing balances.
 */
const buildCampaignAddress = (campaignerAddress: string, campaign_id: string) => {
  const campaigner = buildCampaigner(campaignerAddress);
  const campaignAddress = campaigner + "_" + campaign_id.toString();

  return campaignAddress;
};

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

export const allocateBalanceToCampaign = async (campaignId: bigint | number, amounts: number, campaignerAccount: string) => {
  const { contract_id } = await provideActiveContract();

  if (contract_id) {
    const contractAddress = ContractId.fromString(contract_id.toString());
    const campaigner = buildCampaigner(campaignerAccount);
    const campaignAddress = buildCampaignAddress(campaignerAccount, campaignId.toString());

    console.log("tinyAmount is added to contract", amounts);

    const functionCallAsUint8Array = encodeFunctionCall("addCampaign", [campaigner, campaignAddress, amounts]);

    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(1000000)
      .setFunctionParameters(functionCallAsUint8Array)
      .setTransactionMemo("Hashbuzz add balance to a campaign account")
      .setGas(100000);

    const exResult = await contractExBalTx.execute(hbarservice.hederaClient);

    //Add current smartContract to the card details
    await prisma.campaign_twittercard.update({
      where:{id:campaignId},
      data:{
        contract_id:contract_id.toString()
      }
    })
    return { transactionId: exResult.transactionId, recipt: exResult.getReceipt(hbarservice.hederaClient) };
  } else {
    throw new Error("Contract id not found");
  }
};

export const payAndUpdateContractForReward = async ({
  campaignerAccount,
  campaignId,
  intracterAccount,
  amount,
}: {
  campaignerAccount: string;
  campaignId: string;
  intracterAccount: string;
  amount: number;
}) => {
  const { contract_id } = await provideActiveContract();

  if (contract_id) {
    const contractAddress = ContractId.fromString(contract_id.toString());
    const campaigner = buildCampaigner(campaignerAccount);
    const campaignAddress = buildCampaignAddress(campaignerAccount, campaignId.toString());
    const IntractorAddress = AccountId.fromString(intracterAccount).toSolidityAddress();

    //!! BUILD Parameters
    const contractParams = new ContractFunctionParameters()
      .addAddress(IntractorAddress)
      .addString(campaigner)
      .addString(IntractorAddress.toString())
      .addString(campaignAddress)
      .addUint256(amount);

    //!! execute transaction
    const contractExecuteTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(1000000)
      .setFunction("payInteractorFromCampaignBalances", contractParams)
      .setPayableAmount(Hbar.fromTinybars(amount));
    const contractExecuteSubmit = await contractExecuteTx.execute(hederaService.hederaClient);
    const contractExecuteRx = await contractExecuteSubmit.getReceipt(hederaService.hederaClient);
    return contractExecuteRx;
  }
};
