import {
  AccountId,
  ContractCallQuery,
  ContractCreateFlow,
  ContractCreateTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  FileAppendTransaction,
  FileCreateTransaction,
  FileId,
  Hbar,
  Status,
  TransferTransaction,
} from "@hashgraph/sdk";
import hederaService from "@services/hedera-service";
import { buildCampaignAddress } from "@shared/helper";
import prisma from "@shared/prisma";
import logger from "jet-logger";
import { provideActiveContract } from "./smartcontract-service";
import { getUserById } from "./user-service";
import BigNumber from "bignumber.js";
const { hederaClient, operatorKey, network, operatorId } = hederaService;

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

export async function addFungibleAndNFTCampaign(tokenId: string | null, amount: number, user_id: string | undefined) {
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
          .addAddress(userAddress.toSolidityAddress())
          .addAddress(userAddress.toSolidityAddress())
          .addInt64(new BigNumber(amount))
      ).setTransactionMemo("Fungible token campaign add");

    const addcampaignTx = await addCampaign.execute(hederaClient);
    const addcampaignRx = await addcampaignTx.getReceipt(hederaClient);
    const addcampaigncontractId = addcampaignRx.status;

    console.log(
      " - Add campaign transaction contractId: " +
      addcampaigncontractId.toString()
    );
    return addcampaigncontractId;
  }
}

export async function closeFungibleAndNFTCampaign(tokenId: string | null, user_id: string | undefined) {
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
          .addAddress(userAddress.toSolidityAddress())
          .addUint256(120)
      );
    const closeCampaignTx = await closeCampaign.execute(hederaClient);
    const closeCampaignRx = await closeCampaignTx.getReceipt(hederaClient);
    const closeCampaigncontractId = closeCampaignRx.status;

    console.log(
      " - Close campaign transaction status: " + closeCampaigncontractId
    );
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

export async function expiryFungibleCampaign(cardId: any) {
  const contractDetails = await provideActiveContract();
  const card = await prisma.campaign_twittercard.findUnique({ where: { id: cardId }, select: { user_user: true, fungible_token_id: true } })

  console.log(card, "Inside expiry fungible campaign");

  if (contractDetails?.contract_id && card && card.user_user) {
    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());
    const addre1 = AccountId.fromString(card?.user_user.hedera_wallet_id);
    const tokenId = AccountId.fromString(card?.fungible_token_id as string);

    // const campaignId = AccountId.fromString("0.0.5811396");
    // const token_id = AccountId.fromString("0.0.5816944");
    // const contractId = ContractId.fromString("0.0.5827491");

    const getBalance = new ContractCallQuery()
      .setContractId(contractAddress)
      .setGas(2000000)
      .setFunction(
        "getFungibleAndNFTCampaignBalance",
        new ContractFunctionParameters()
          .addAddress(addre1.toSolidityAddress())
          .addAddress(tokenId.toSolidityAddress())
      )
      .setQueryPayment(new Hbar(10));

    const contractCallResult = await getBalance.execute(hederaClient);
    const getBalanceRx = contractCallResult.getUint256();
    console.log(" - The Campaign Balance " + getBalanceRx);

    const closeCampaign = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(400000)
      .setFunction(
        "expiryFungibleAndNFTCampaign",
        new ContractFunctionParameters()
          .addAddress(tokenId.toSolidityAddress())
          .addAddress(addre1.toSolidityAddress())
          .addAddress(addre1.toSolidityAddress())
          .addUint256(getBalanceRx)
      );
    const closeCampaignTx = await closeCampaign.execute(hederaClient);
    const closeCampaignRx = await closeCampaignTx.getReceipt(hederaClient);
    const closeCampaigncontractId = closeCampaignRx.status;

    console.log(
      " - Expiry campaign transaction status: " + closeCampaigncontractId
    );
  }
}

export async function expiryCampaign(cardId: any) {

  const card = await prisma.campaign_twittercard.findUnique({ where: { id: cardId }, select: { user_user: true } })

  console.log(card, "Inside expiry hbar campaign");
  const contractDetails = await provideActiveContract();
  if (contractDetails?.contract_id && card?.user_user) {
    const addre1 = AccountId.fromString(card?.user_user.hedera_wallet_id);

    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());

    const closeCampaign = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(400000)
      .setFunction(
        "expiryCampaign",
        new ContractFunctionParameters().addAddress(
          addre1.toSolidityAddress()
        ).addAddress(
          addre1.toSolidityAddress()
        )
      );
    const closeCampaignTx = await closeCampaign.execute(hederaClient);
    const closeCampaignRx = await closeCampaignTx.getReceipt(hederaClient);
    const closeCampaigncontractId = closeCampaignRx.status;

    console.log(
      " - Expiry campaign transaction status: " + closeCampaigncontractId
    );
  }
}

export async function distributeToken(tokenId: string, campaignId: string, userId: string, amount: number) {

  try {
    const contractDetails = await provideActiveContract();
    console.log("Inside distributed fungible token", tokenId, campaignId, userId, amount);
    if (contractDetails?.contract_id) {
      const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());
      const contract_id = AccountId.fromString(contractDetails?.contract_id)
      const token_id = AccountId.fromString(tokenId)
      const campaign_id = AccountId.fromString(campaignId);
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
            .addAddress(campaign_id.toSolidityAddress())
            .addInt64(new BigNumber(amount))
        ).setTransactionMemo("Distribute fungible ")

      // const signdistribute = await distribute.freezeWith(client).sign(privateKey);
      const submitTransfer = await distribute.execute(hederaClient);
      const distributeRx = await submitTransfer.getReceipt(hederaClient);
      const tokenStatus = distributeRx.status;
      console.log(" - The transfer transaction status " + tokenStatus);
      return Number(tokenStatus);
    }
  } catch (err) {
    console.log(err, "Error")
  }
}  