import { ContractExecuteTransaction, Hbar, ContractFunctionParameters, AccountId, ContractId } from "@hashgraph/sdk";
import { provideActiveContract } from "@services/smartcontract-service";
import signingService from "@services/signing-service";

export const createTopUpTransaction = async (payerId: string, amount: number) => {
  const { contract_id } = await provideActiveContract();

  if (contract_id) {
    const address = AccountId.fromString(payerId).toString();
    const contractAddress = ContractId.fromString(contract_id.toString());
    const deposit = true;

    //initiate new contract params
    const contractParams = new ContractFunctionParameters();

    contractParams.addAddress(address);
    contractParams.addUint256(amount * Math.pow(10, 8));
    contractParams.addBool(deposit);

    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(1000000)
      .setPayableAmount(new Hbar(amount))
      .setFunction("updateBalance", contractParams)
      .setTransactionMemo("Hashbuzz balance update call")
      .setGas(100000);

    return signingService.signAndMakeBytes(contractExBalTx, payerId);
  } else {
    throw new Error("Contract id not found");
  }
};
