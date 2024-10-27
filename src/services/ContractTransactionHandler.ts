import HederaContract from "./Contract";
import { Transactions } from "../../contractsV201";
import { ethers } from "ethers";
import { ContractFunctionParameters } from "@hashgraph/sdk";

const transactionsAbi = Transactions.abi as ethers.InterfaceAbi;

class TransactionHandler {
    private hederaContract: HederaContract;

    constructor() {
        this.hederaContract = new HederaContract(transactionsAbi);
    }

    // Method to handle deposit
    async handleDeposit(campaigner: string, amount: number): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(campaigner)
            .addUint256(amount);

        await this.hederaContract.callContractWithStateChange("handleDeposit", params);
    }

    // Method to handle withdrawal
    async handleWithdrawal(campaigner: string, amount: number): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(campaigner)
            .addUint256(amount);

        await this.hederaContract.callContractWithStateChange("handleWithdrawal", params);
    }

    // Method to update balance (top-up or reimbursement)
    async updateBalance(campaigner: string, amount: number, deposit: boolean): Promise<number> {
        const params = new ContractFunctionParameters()
            .addAddress(campaigner)
            .addUint256(amount)
            .addBool(deposit);

        const { dataDecoded } = await this.hederaContract.callContractWithStateChange("updateBalance", params);
        return dataDecoded![0];
    }

    // Method to add fungible amount
    async addFungibleAmount(campaigner: string, tokenId: string, tokenAmount: number): Promise<number> {
        const params = new ContractFunctionParameters()
            .addAddress(campaigner)
            .addAddress(tokenId)
            .addInt64(tokenAmount);

        const { dataDecoded } = await this.hederaContract.callContractWithStateChange("addFungibleAmount", params);
        return dataDecoded![0];
    }

    // Method to reimburse balance for fungible tokens
    async reimburseBalanceForFungible(tokenId: string, campaigner: string, amount: number, tokenType: 1 | 2): Promise<number> {
        const params = new ContractFunctionParameters()
            .addAddress(tokenId)
            .addAddress(campaigner)
            .addInt64(amount)
            .addUint32(tokenType);

        const { dataDecoded } = await this.hederaContract.callContractWithStateChange("reimburseBalanceForFungible", params);
        return dataDecoded![0];
    }
}

export default TransactionHandler;