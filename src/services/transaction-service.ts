import { AccountId, ContractExecuteTransaction, ContractFunctionParameters, ContractId, Hbar, TokenInfo, TransferTransaction } from "@hashgraph/sdk";
// import { default as hbarservice, default as hederaService } from "@services/hedera-service";
import signingService from "@services/signing-service";
import { encodeFunctionCall, provideActiveContract, queryBalance } from "@services/smartcontract-service";
import { buildCampaignAddress, buildCampaigner, sensitizeUserData } from "@shared/helper";
import prisma from "@shared/prisma";
import JSONBigInt from "json-bigint";
import { CreateTranSactionEntity } from "src/@types/custom";
import { getCampaignDetailsById } from "./campaign-service";
import userService from "./user-service";
import hederaService from "@services/hedera-service";

const { hederaClient, operatorKey, network, operatorId } = hederaService;

export const updateBalanceToContract = async (payerId: string, amounts: { value: number; fee: number; total: number }) => {
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    const address = AccountId.fromString(payerId);
    const deposit = true;
    const amount = Math.floor(amounts.value * 1e8);
    const gas = new Hbar(1.75).toTinybars().toNumber();

    const backupContract = contractDetails?.contract_id;
    const contractAddress = ContractId.fromString(backupContract.toString());

    const tokenTransfer = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(2000000)
      .setFunction("updateBalance", new ContractFunctionParameters().addAddress(address.toSolidityAddress()).addUint256(amount).addBool(deposit))
      .setTransactionMemo(`Top up from the account ${payerId}`);

    const submitTransfer = await tokenTransfer.execute(hederaClient);
    const tokenTransferRx = await submitTransfer.getReceipt(hederaClient);
    const tokenStatus = tokenTransferRx.status;
    console.log(" - The updated transaction status " + tokenStatus);


    // const tokenTransfer = new ContractExecuteTransaction()
    //   .setContractId(backupContract)
    //   .setGas(2000000)
    //   .setFunction(
    //     "updateBalance",
    //     new ContractFunctionParameters()
    //       .addAddress(address.toSolidityAddress())
    //       .addUint256(amount)
    //       .addBool(true)
    //   );

    // const submitTransfer = await tokenTransfer.execute(hederaClient);
    // const tokenTransferRx = await submitTransfer.getReceipt(hederaClient);
    // const tokenStatus = tokenTransferRx.status;
    // console.log(" - The updated transaction status " + tokenStatus);


    return { transactionId: submitTransfer.transactionId, recipt: tokenTransferRx };
    // return signingService.signAndMakeBytes(contractExBalTx, payerId);
  } else {
    throw new Error("Contract id not found");
  }
};

export const createTopUpTransaction = async (entity: CreateTranSactionEntity, connectedAccountId: string) => {
  // console.log("Creating Transaction Hash with:", { payerId, amounts });
  const { value, fee, total } = entity.amount;
  const contractDetails = await provideActiveContract();
  if (contractDetails?.contract_id) {
    const transferTx = new TransferTransaction().setTransactionMemo("Hashbuzz balance topup");
    if (entity.entityType === "HBAR")
      transferTx
        .addHbarTransfer(connectedAccountId, -total)
        .addHbarTransfer(contractDetails.contract_id?.toString(), value)
        .setTransactionMemo("Hashbuzz escrow payment")
        .addHbarTransfer(operatorId, fee);

    if (entity.entityType === "FUNGIBLE_COMMON" && entity.entityId) {
      const token = await prisma.whiteListedTokens.findUnique({ where: { token_id: entity.entityId } });
      if (token && token.tokendata) {
        const tokenInfo: TokenInfo = JSON.parse(JSON.stringify(token.tokendata));
        const decimal = parseInt("" + tokenInfo.decimals);
        transferTx
          .addTokenTransfer(entity.entityId, connectedAccountId, -(total * Math.pow(10, decimal)))
          .addTokenTransfer(entity.entityId, contractDetails.contract_id.toString(), value * Math.pow(10, decimal))
          .setTransactionMemo("Hashbuzz escrow payment")
          .addTokenTransfer(entity.entityId, operatorId, fee * Math.pow(10, decimal));
      }
    }
    const transactionId = transferTx.transactionId?.toString();
    console.log(transactionId, "Transaction Id");
    //signing and returning
    return signingService.signAndMakeBytes(transferTx, connectedAccountId);
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
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails.contract_id.toString());
    const campaigner = buildCampaigner(campaignerAccount);
    const campaignAddress = buildCampaignAddress(campaignerAccount, campaignId.toString());

    console.log("tinyAmount is added to contract", amounts);

    // const functionCallAsUint8Array = encodeFunctionCall("addCampaign", [campaigner, campaignAddress, amounts]);
    const params = new ContractFunctionParameters().addString(campaigner).addString(campaignAddress).addUint256(amounts);

    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setFunction("addCampaign", params)
      .setTransactionMemo("Hashbuzz add balance to a campaign account" + campaignAddress)
      .setGas(10000000);

    const exResult = await contractExBalTx.execute(hederaClient);
    const receipt = await exResult.getReceipt(hederaClient);

    console.log("allocateBalanceToCampaign::finished-with-transactionId", exResult.transactionId);

    return { contract_id: contractDetails.contract_id, transactionId: exResult.transactionId, receipt };
  } else {
    throw new Error("Contract id not found");
  }
};

export const updateCampaignBalance = async ({ campaignerAccount, campaignId, amount }: { campaignerAccount: string; campaignId: string; amount: number }) => {
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails.contract_id.toString());
    const campaignAddress = buildCampaignAddress(campaignerAccount, campaignId.toString());

    console.log("Update SM balances For campaign", { campaignAddress: campaignAddress.toString(), contract_id: contractDetails.contract_id, amount });

    const params = new ContractFunctionParameters().addString(campaignAddress).addUint256(amount);

    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setFunction("payInteractorFromCampaignBalances", params)
      .setTransactionMemo("Hashbuzz subtracting campaign balance from campaign::" + campaignAddress)
      .setGas(1000000);

    const contractExecuteSubmit = await contractExBalTx.execute(hederaClient);
    const contractExecuteRx = await contractExecuteSubmit.getReceipt(hederaClient);
    return contractExecuteRx;
  }
};

export const withdrawHbarFromContract = async (intracterAccount: string, amount: number) => {
  const contractDetails = await provideActiveContract();
  amount = amount / Math.pow(10, 8);

  console.log({ intracterAccount, contract_id: contractDetails?.contract_id, amount, amounte8: amount * 1e8 });

  if (contractDetails?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails.contract_id.toString());
    const IntractorAddress = AccountId.fromString(intracterAccount).toSolidityAddress();

    //   //!! BUILD Parameters
    const functionCallAsUint8Array = encodeFunctionCall("callHbarToPayee", [IntractorAddress, Math.round(amount * 1e8)]);

    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setFunctionParameters(functionCallAsUint8Array)
      .setTransactionMemo("Hashbuzz rewarding to intractor with adderss" + intracterAccount)
      .setGas(1000000);

    const contractExecuteSubmit = await contractExBalTx.execute(hederaClient);
    const contractExecuteRx = await contractExecuteSubmit.getReceipt(hederaClient);
    return contractExecuteRx;
  }
};

export const transferAmountFromContractUsingSDK = async (intracterAccount: string, amount: number, memo = "Reward payment from hashbuzz") => {
  const contractDetails = await provideActiveContract();
  amount = Math.round(amount) / 1e8;


  if (contractDetails?.contract_id) {

    const backupContract = contractDetails?.contract_id;
    const backupContract1 = AccountId.fromString(backupContract);

    const transferTx = new TransferTransaction()
      .addHbarTransfer(backupContract1, - (amount))
      .addHbarTransfer(intracterAccount, (amount))
      .setTransactionMemo(memo)
      .freezeWith(hederaClient);
    const transferSign = await transferTx.sign(hederaService.operatorKey);
    const transferSubmit = await transferSign.execute(hederaClient);
    const transferRx = await transferSubmit.getReceipt(hederaClient);
    return transferRx;
  }
};

export const closeCampaignSMTransaction = async (campingId: number | bigint) => {
  const campaignDetails = await getCampaignDetailsById(campingId);
  const { user_user, id, contract_id, name } = campaignDetails!;

  if (user_user?.hedera_wallet_id && contract_id && name) {
    const campaigner = buildCampaigner(user_user?.hedera_wallet_id);
    const campaignAddress = buildCampaignAddress(user_user.hedera_wallet_id, id.toString());

    const contractAddress = ContractId.fromString(contract_id.trim().toString());

    const params = new ContractFunctionParameters().addString(campaigner).addString(campaignAddress);

    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setFunction("closeCampaign", params)
      .setTransactionMemo("Hashbuzz close campaign operation for " + name)
      .setGas(1000000);

    const contractExecuteSubmit = await contractExBalTx.execute(hederaClient);
    const contractExecuteRx = await contractExecuteSubmit.getReceipt(hederaClient);
    return contractExecuteRx;
  }
};

export const reimbursementAmount = async (userId: number | bigint, amounts: number, accountId: string) => {
  console.log("Reimbursement::", { amounts, accountId });
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    const backupContract = contractDetails?.contract_id;

    const address = AccountId.fromString(accountId);
    const contractAddress = ContractId.fromString(backupContract.toString());
    const deposit = false;

    console.log("tinyAmount is Reimbursed from contract", amounts);

    // const functionCallAsUint8Array = encodeFunctionCall("updateBalance", [address, amounts, deposit]);

    const tokenTransfer = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(2000000)
      .setFunction("updateBalance", new ContractFunctionParameters().addAddress(address.toSolidityAddress()).addUint256(amounts).addBool(deposit))
      .setTransactionMemo("Hashbuzz balance update call");

    const submitTransfer = await tokenTransfer.execute(hederaClient);
    const tokenTransferRx = await submitTransfer.getReceipt(hederaClient);
    const tokenStatus = tokenTransferRx.status;
    console.log(" - The updated transaction status is " + tokenStatus);

    const balance = await queryBalance(accountId);
    const userData = await userService.topUp(userId, parseInt(balance?.balances ?? "0"), "update");

    const paymentTransaction = await transferAmountFromContractUsingSDK(accountId, amounts, "Reimbursement payment from hashbuzz");
    return { paymentTransaction, contractCallReceipt: tokenTransferRx, userData: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(userData))) };
  }
};

