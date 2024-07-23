import {
  AccountId,
  ContractCallQuery,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  Hbar,
  TransferTransaction
} from "@hashgraph/sdk";
import { campaign_twittercard, user_user } from "@prisma/client";
import hederaService from "@services/hedera-service";
import BigNumber from "bignumber.js";
import logger from "jet-logger";
import { provideActiveContract } from "./smartcontract-service";
const { hederaClient } = hederaService;

export async function associateTokentoContract(tokenId: string) {
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());
    const token = ContractId.fromString(tokenId.toString())
    const associateToken = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(2000000)
      .setFunction(
        "contractAssociate",
        new ContractFunctionParameters().addAddress(token.toSolidityAddress())
      );

    const contractCallResult = await associateToken.execute(hederaClient);
    const associateTokenRx = await contractCallResult.getReceipt(hederaClient);
    const associateTokenStatus = associateTokenRx.status;
    console.log(
      " - The Contract associate transaction status:" + associateTokenStatus
    );
  }
}

export async function addFungibleAndNFTCampaign(tokenId: string, amount: number, user_id: string, campaign: string) {
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());
    const token_id = ContractId.fromString(tokenId as string);
    const userAddress = AccountId.fromString(user_id as string);

    console.log(tokenId, amount, user_id, "Inside fungible campaign");

    const addCampaign = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(400000)
      .setFunction(
        "addFungibleAndNFTCampaign",
        new ContractFunctionParameters()
          .addAddress(token_id.toSolidityAddress())
          .addString(campaign)
          .addAddress(userAddress.toSolidityAddress())
          .addInt64(new BigNumber(amount))
      ).setTransactionMemo(`Fungible token campaign add ${campaign}`);

    const addcampaignTx = await addCampaign.execute(hederaClient);
    const recipt = await addcampaignTx.getReceipt(hederaClient);
    const status = recipt.status;

    console.log(
      " - Add campaign transaction contractId: " +
      status.toString()
    );
    return {
      transactionId: addcampaignTx.transactionId.toString(),
      recipt,
      status
    };;
  }
}

export async function closeFungibleAndNFTCampaign(tokenId: string | null, user_id: string | undefined, campaign:string) {
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    console.log(tokenId, user_id);
    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());
    const token_id = ContractId.fromString(tokenId as string);
    const userAddress = AccountId.fromString(user_id as string);

    const closeCampaign = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(400000)
      .setFunction(
        "closeFungibleAndNFTCampaign",
        new ContractFunctionParameters()
          .addAddress(token_id.toSolidityAddress())
          .addString(campaign)
          .addUint256(120)
      );
    const closeCampaignTx = await closeCampaign.execute(hederaClient);
    const closeCampaignRx = await closeCampaignTx.getReceipt(hederaClient);
    const closeCampaigncontraStatus = closeCampaignRx.status;
    const transactionId = closeCampaignTx.transactionId;

    const logData = `- Close campaign transaction status: ${closeCampaigncontraStatus}`;
    console.log(logData);
    logger.info(logData);
    return {staus:closeCampaigncontraStatus , transactionId}
  }

}
export async function getHbarCampaignBalance(campaignId: any) {
  const contractDetails = await provideActiveContract();
  if (contractDetails?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());

    const getBalance = new ContractCallQuery()
      .setContractId(contractAddress)
      .setGas(2000000)
      .setFunction(
        "getCampaignBalance",
        new ContractFunctionParameters().addAddress(
          campaignId.toSolidityAddress()
        )
      )
      .setQueryPayment(new Hbar(10));

    const contractCallResult = await getBalance.execute(hederaClient);
    const getBalanceRx = contractCallResult.getUint256();
    console.log(" - The Campaign Balance " + getBalanceRx);
    return getBalanceRx;
  }
}

export async function expiryFungibleCampaign(card: campaign_twittercard, cardOwner:user_user) {
  const contractDetails = await provideActiveContract();

  logger.info(`Fungible campaign expiry operation for card ::::  ${card.id}`);

  if (contractDetails?.contract_id && card.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());
    const addre1 = AccountId.fromString(cardOwner.hedera_wallet_id);
    const tokenId = AccountId.fromString(card?.fungible_token_id as string);

    const getBalance = new ContractCallQuery()
      .setContractId(contractAddress)
      .setGas(2000000)
      .setFunction(
        "getFungibleAndNFTCampaignBalance",
        new ContractFunctionParameters().addString(card.contract_id).addAddress(tokenId.toSolidityAddress())
      )
      .setQueryPayment(new Hbar(10));

    const contractCallResult = await getBalance.execute(hederaClient);
    const getBalanceRx = contractCallResult.getUint256();
    logger.info(`- The Campaign fungible Balance  for cmapign ${card.id} ::: ${getBalanceRx.toString()}`);

    const closeCampaign = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(400000)
      .setFunction(
        "expiryFungibleCampaign",
        new ContractFunctionParameters()
          .addAddress(tokenId.toSolidityAddress())
          .addString(card.contract_id)
          .addAddress(addre1.toSolidityAddress())
      );
    const closeCampaignTx = await closeCampaign.execute(hederaClient);
    const recipt = await closeCampaignTx.getReceipt(hederaClient);

    const closeCampaignStaus = recipt.status;
    const transactionId = recipt.scheduledTransactionId

    logger.info(`- Expiry campaign transaction status for card ${card.id} ::: ${closeCampaignStaus}`);
    return  {staus:closeCampaignStaus , transactionId , recipt , contractBal:getBalanceRx.toNumber()}
  }
}

export async function expiryCampaign(card:campaign_twittercard , cardOwner:user_user) {

  logger.info(`SM transaction for update expiry status of card ::  ${card.id}`);

  // get Active contract for transaction.
  const contractDetails = await provideActiveContract();

  // check for  required coditions 
  if (contractDetails?.contract_id && cardOwner.hedera_wallet_id && card.contract_id) {

    const addre1 = AccountId.fromString(cardOwner.hedera_wallet_id);
    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());

    const closeCampaign = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(400000)
      .setFunction(
        "expiryCampaign",
        new ContractFunctionParameters().addString(card.contract_id).addAddress(addre1.toSolidityAddress())
      );

    const trnsactionRespose = await closeCampaign.execute(hederaClient);
    const transactionRecipt = await trnsactionRespose.getReceipt(hederaClient);

    const transactionStatus = transactionRecipt.status;
    const transactionId = transactionRecipt.scheduledTransactionId

    logger.info(`Expiry campaign SM transaction status for card ${card.id}:::${transactionStatus} `);

    return {staus:transactionStatus , transactionId , recipt:transactionRecipt}
  }
  else {
    throw new Error("User Or card details os incorrect")
  }
}

export async function distributeToken(tokenId: string, userId: string, amount: number, campaign:string) {

  try {
    const contractDetails = await provideActiveContract();
    console.log("Inside distributed fungible token", tokenId, userId, amount);
    if (contractDetails?.contract_id) {
      const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());
      const contract_id = AccountId.fromString(contractDetails?.contract_id)
      const token_id = AccountId.fromString(tokenId)
      const campaign_id = campaign;
      const user1Account = AccountId.fromString(userId);

      //Create the transfer transaction
      const transaction = new TransferTransaction()
        .addTokenTransfer(token_id, contract_id, -amount)
        .addTokenTransfer(token_id, user1Account, amount);

      //Sign with the client operator private key and submit to a Hedera network
      const txResponse = await transaction.execute(hederaClient);

      //Request the receipt of the transaction
      const receipt = await txResponse.getReceipt(hederaClient);

      //Obtain the transaction consensus status
      const transactionStatus = receipt.status;

      console.log("The transaction consensus status " + transactionStatus.toString());


      const distribute = new ContractExecuteTransaction()
        .setContractId(contractAddress)
        .setGas(80000)
        .setFunction(
          "distributeFungible",
          new ContractFunctionParameters()
            .addAddress(token_id.toSolidityAddress())
            .addAddress(user1Account.toSolidityAddress())
            .addString(campaign_id)
            .addInt64(new BigNumber(amount))
        ).setTransactionMemo("Fungile reward distributed")

      // const signdistribute = await distribute.freezeWith(client).sign(privateKey);
      const submitTransfer = await distribute.execute(hederaClient);
      const distributeRx = await submitTransfer.getReceipt(hederaClient);
      const tokenStatus = distributeRx.status;
      console.log(" - The transfer transaction status " + tokenStatus);
      return Number(tokenStatus);
    }
  } catch (err) {
    console.log(err, "Error")
    // return err;
  }
}  