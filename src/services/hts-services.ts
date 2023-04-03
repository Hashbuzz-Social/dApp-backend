import hederaService from "@services/hedera-service";
import { TokenInfoQuery, ContractExecuteTransaction, ContractFunctionParameters, AccountId, TokenInfo } from "@hashgraph/sdk";
import { provideActiveContract } from "./smartcontract-service";
import prisma from "@shared/prisma";
import { BigNumber } from "bignumber.js";

const { hederaClient, operatorKey } = hederaService;

const getTokenInfo = async (tokenId: string) => {
  const query = new TokenInfoQuery().setTokenId(tokenId);

  //Sign with the client operator private key, submit the query to the network and get the token supply
  const info = await query.execute(hederaClient);
  return info;
};

/**
 * Associates a token with the active contract.
 *
 * @param tokenId - The ID of the token to associate.
 * @returns An object containing the transaction receipt and status.
 */
const associateTokenToContract = async (tokenId: string) => {
  // Retrieve the ID of the active contract.
  const { contract_id } = await provideActiveContract();

  // Convert the token ID to a Solidity address.
  const tokenAddress = AccountId.fromString(tokenId).toSolidityAddress();

  if (contract_id) {
    // Create a new ContractExecuteTransaction to associate the token with the contract.
    const associateToken = new ContractExecuteTransaction()
      .setContractId(contract_id)
      .setGas(2000000)
      .setFunction("contractAssociate", new ContractFunctionParameters().addAddress(tokenAddress));

    // Execute the transaction and retrieve the receipt.
    const contractCallResult = await associateToken.execute(hederaClient);
    const associateTokenRx = await contractCallResult.getReceipt(hederaClient);

    // Retrieve the transaction status and log it to the console.
    const associateTokenStatus = associateTokenRx.status;
    console.log(" - The Contract associate transaction status:" + associateTokenStatus);

    // Return an object containing the transaction receipt and status.
    return { associateTokenRx, status: associateTokenStatus };
  }
};

const updateTokenTopupBalanceToContract = async (payerId: string, amount: number, token_id: string) => {
    console.log("updateTokenTopupBalanceToContract::->",{payerId , amount , token_id})
  const { contract_id } = await provideActiveContract();

  //if a active contract is available for interaction
  if (contract_id) {
    const payerAddress = AccountId.fromString(payerId).toSolidityAddress();
    const tokenAddress = AccountId.fromString(token_id).toSolidityAddress();
    const topupAmount = new BigNumber(amount);

    //!!! create a contract execution transaction
    const transferToken = new ContractExecuteTransaction()
      .setContractId(contract_id)
      .setGas(500000)
      .setFunction("transferTokenToContract", new ContractFunctionParameters().addAddress(tokenAddress).addAddress(payerAddress).addInt64(topupAmount));

    const transferTokenSign = await transferToken.freezeWith(hederaClient).sign(operatorKey);

    const transferTokenTx = await transferTokenSign.execute(hederaClient);
    const transferTokenRx = await transferTokenTx.getReceipt(hederaClient);
    const tokenStatus = transferTokenRx.status;
    return tokenStatus;
    // console.log(" - The transfer transaction status " + tokenStatus);
    // /////////////////////////check contract Balance /////////////////////////
    // const query = new ContractInfoQuery().setContractId(contractId);

    // const info = await query.execute(client);
    // const balance = info.tokenRelationships.get(tokenId).balance;

    // console.log(
    //   " - The contract balance for token " + tokenId + " is: " + balance
    // );
    // }
  }
};

const getEntityDetailsByTokenId = async (token_id: string) => {
  const entityData = await prisma.whiteListedTokens.findUnique({ where: { token_id } });
  if (entityData) {
    const { tokendata, ...rest } = entityData;
    const tokenInfo: TokenInfo = JSON.parse(JSON.stringify(tokendata));
    return { ...rest, tokendata: tokenInfo };
  }
  return false;
};

export default { getTokenInfo, associateTokenToContract, getEntityDetailsByTokenId  , updateTokenTopupBalanceToContract};

