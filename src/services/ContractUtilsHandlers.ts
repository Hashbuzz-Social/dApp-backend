import { ContractFunctionParameters } from "@hashgraph/sdk";
import { ethers } from "ethers";
import { Utils } from "../../contractsV201";
import HederaContract from "./Contract";

const utilsAbi = Utils.abi as ethers.InterfaceAbi;

class UtilsHandler {
    private hederaContract: HederaContract;

    constructor() {
        this.hederaContract = new HederaContract(utilsAbi);
    }

    // Method to check if a token is whitelisted
    async isTokenWhitelisted(tokenType: 1 | 2, tokenAddress: string): Promise<boolean> {
        const params = new ContractFunctionParameters()
            .addUint32(tokenType)
            .addAddress(tokenAddress);

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("isTokenWhitelisted", params);
        return dataDecoded[0];
    }

    // Method to associate a token
    async associateToken(tokenAddress: string, tokenType: 1 | 2, isWhitelisted: boolean): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(tokenAddress)
            .addUint32(tokenType)
            .addBool(isWhitelisted);

        await this.hederaContract.callContractWithStateChange("associateToken", params);
    }

    // Method to get all whitelisted tokens
    async getAllWhitelistedTokens(tokenType: 1 | 2): Promise<string[]> {
        const params = new ContractFunctionParameters().addUint32(tokenType);

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("getAllWhitelistedTokens", params);
        return dataDecoded;
    }

    // Method to add a campaigner
    async addCampaigner(newCampaigner: string): Promise<void> {
        const params = new ContractFunctionParameters().addAddress(newCampaigner);

        await this.hederaContract.callContractWithStateChange("addCampaigner", params);
    }

    // Method to get fungible token balance
    async getFungibleTokenBalance(campaigner: string, tokenId: string): Promise<number> {
        const params = new ContractFunctionParameters()
            .addAddress(campaigner)
            .addAddress(tokenId)
            .addUint32(1); // 1 for FUNGIBLE

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("getFungibleTokenBalance", params);
        return dataDecoded[0];
    }

    // Method to get NFT token balance
    async getNFTTokenBalance(campaigner: string, tokenId: string): Promise<number> {
        const params = new ContractFunctionParameters()
            .addAddress(campaigner)
            .addAddress(tokenId)
            .addUint32(2); // 2 for NFT

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("getNFTTokenBalance", params);
        return dataDecoded[0];
    }

    // Method to get campaign balance
    async getCampaignBalance(campaignAddress: string): Promise<number> {
        const params = new ContractFunctionParameters().addString(campaignAddress);

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("getCampaignBalance", params);
        return dataDecoded[0];
    }
}

export default UtilsHandler;