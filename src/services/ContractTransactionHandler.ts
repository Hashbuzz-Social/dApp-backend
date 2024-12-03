import HederaContract from "./Contract";
import { Transactions } from "../contractsV201";
import { ethers } from "ethers";
import { AccountId, ContractFunctionParameters } from "@hashgraph/sdk";

const transactionsAbi = Transactions.abi as ethers.InterfaceAbi;

export const TransactionMemoCodes = {
    "handleDeposit": "ħbuzz_TV201_1",
    "handleWithdrawal": "ħbuzz_TV201_2",
    "updateBalance": "ħbuzz_TV201_3",
    "addFungibleAmount": "ħbuzz_TV201_4",
    "reimburseBalanceForFungible": "ħbuzz_TV201_5"
}

const createTransactionMemo = (functionName: keyof typeof TransactionMemoCodes, memo?: string): string => {
    return `${TransactionMemoCodes[functionName]}${memo ? "_" + memo : ""}`;
}

class ContractTransactions {
    private hederaContract: HederaContract;

    constructor() {
        this.hederaContract = new HederaContract(transactionsAbi);
    }

    // Method to handle deposit
    async handleDeposit(campaigner: string, amount: number, memo?: string): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addUint256(amount);

        await this.hederaContract.callContractWithStateChange("handleDeposit", params, createTransactionMemo("handleDeposit", memo));
    }

    // Method to handle withdrawal
    async handleWithdrawal(campaigner: string, amount: number, memo?: string): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addUint256(amount);

        await this.hederaContract.callContractWithStateChange("handleWithdrawal", params, createTransactionMemo("handleWithdrawal", memo));
    }

    // Method to update balance (top-up or reimbursement)
    async updateBalance(campaigner: string, amount: number, deposit: boolean, memo?: string): Promise<number | bigint> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addUint256(amount)
            .addBool(deposit);

        const result = await this.hederaContract.callContractWithStateChange("updateBalance", params, createTransactionMemo("updateBalance", memo));
        if ('dataDecoded' in result && result.dataDecoded) {
            return result.dataDecoded[0];
        }
        throw new Error("Failed to decode data");
    }

    // Method to add fungible amount
    async addFungibleAmount(campaigner: string, tokenId: string, tokenAmount: number, memo?: string): Promise<number | bigint> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addAddress(AccountId.fromString(tokenId).toSolidityAddress())
            .addUint256(tokenAmount); // Changed from addUint64 to addUint256

        const result = await this.hederaContract.callContractWithStateChange("addFungibleAmount", params, createTransactionMemo("addFungibleAmount", memo));

        if ('dataDecoded' in result && result.dataDecoded) {
            return result.dataDecoded[0];
        }
        throw new Error("Failed to decode data");
    }

    // Method to reimburse balance for fungible tokens
    async reimburseCampaigner(tokenId: string, campaigner: string, amount: number, memo?: string): Promise<number | bigint> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(tokenId).toSolidityAddress())
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addUint256(amount); // Changed from addUint64 to addUint256

        const result = await this.hederaContract.callContractWithStateChange("reimburseCampaigner", params, createTransactionMemo("reimburseBalanceForFungible", memo));
        if ('dataDecoded' in result && result.dataDecoded) {
            return result.dataDecoded[0];
        }
        throw new Error("Failed to decode data");
    }
}

export const contractTransactionHandler = new ContractTransactions();
export default ContractTransactions;
