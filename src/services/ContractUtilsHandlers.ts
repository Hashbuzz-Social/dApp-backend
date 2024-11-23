import { AccountId, ContractFunctionParameters, Status } from "@hashgraph/sdk";
import { ethers } from "ethers";
import { Utils } from "../contractsV201";
import HederaContract from "./Contract";

const utilsAbi = Utils.abi as ethers.InterfaceAbi;

const transactionMemo = {
    "associateToken": "ħbuzz_UV201_1",
    "addCampaigner": "ħbuzz_UV201_2",
}

class ContractUtils {
    private hederaContract: HederaContract;

    constructor(contractId?: string) {
        this.hederaContract = new HederaContract(utilsAbi, contractId);
    }

    // Method to check if a token is whitelisted
    async isTokenWhitelisted(tokenAddress: string): Promise<boolean> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(tokenAddress).toSolidityAddress());

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("isTokenWhitelisted", params);
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return dataDecoded[0];
    }

    // Method to associate a token
    async associateToken(tokenAddress: string, isWhitelisted: boolean): Promise<Status> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(tokenAddress).toSolidityAddress())
            .addBool(isWhitelisted);

        const contractCallResponse = await this.hederaContract.callContractWithStateChange("associateToken", params, transactionMemo.associateToken);
        return contractCallResponse.status;
    }

    // Method to get all whitelisted tokens
    async getAllWhitelistedTokens(): Promise<string[]> {
        const params = new ContractFunctionParameters();

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("getAllWhitelistedTokens", params);
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return dataDecoded[0] as string[];
    }

    // Method to add a campaigner
    async addCampaigner(newCampaigner: string): Promise<Status> {
        const params = new ContractFunctionParameters().addAddress(AccountId.fromString(newCampaigner).toSolidityAddress());
        const response = await this.hederaContract.callContractWithStateChange("addCampaigner", params, transactionMemo.addCampaigner);
        return response.status;
    }

    // Method to get fungible token balance
    async getFungibleTokenBalance(campaigner: string, tokenId: string): Promise<number> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addAddress(AccountId.fromString(tokenId).toSolidityAddress());

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("getFungibleTokenBalance", params);
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return dataDecoded[0];
    }

    // Method to get HBAR balance
    async getHbarBalance(campaigner: string): Promise<number> {
        const params = new ContractFunctionParameters().addAddress(AccountId.fromString(campaigner).toSolidityAddress());

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("getHbarBalance", params);
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return dataDecoded[0];
    }

    // Method to get campaign balance
    async getCampaignBalance(campaignAddress: string): Promise<number> {
        const params = new ContractFunctionParameters().addString(campaignAddress);

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("getCampaignBalance", params);
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return dataDecoded[0];
    }
    // Method to get fungible token campaign balance
    async getFungibleCampaignBalance(campaignAddress: string, tokenId: string): Promise<number> {
        const params = new ContractFunctionParameters().addString(campaignAddress).addAddress(AccountId.fromString(tokenId).toSolidityAddress());

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("getFungibleCampaignBalance", params);
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return dataDecoded[0];
    }
}

export const utilsHandlerService = new ContractUtils();
export default ContractUtils;
