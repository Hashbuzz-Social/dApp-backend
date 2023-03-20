import hederaService from "@services/hedera-service";
import { TokenInfoQuery, ContractExecuteTransaction, ContractFunctionParameters, AccountId } from "@hashgraph/sdk";
import { provideActiveContract } from "./smartcontract-service";

const { hederaClient } = hederaService;

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

export default { getTokenInfo, associateTokenToContract };
