import { AccountId, ContractFunctionParameters, Status } from "@hashgraph/sdk";
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
            .addAddress(AccountId.fromString(tokenAddress).toSolidityAddress());

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("isTokenWhitelisted", params);
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return dataDecoded[0];
    }

    // Method to associate a token
    async associateToken(tokenAddress: string, tokenType: 1 | 2, isWhitelisted: boolean): Promise<Status> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(tokenAddress).toSolidityAddress())
            .addUint32(tokenType)
            .addBool(isWhitelisted);

        const contractCallResponse = await this.hederaContract.callContractWithStateChange("associateToken", params);
        return contractCallResponse.status
    }

    // Method to get all whitelisted tokens
    async getAllWhitelistedTokens(tokenType: 1 | 2): Promise<string[]> {
        const params = new ContractFunctionParameters().addUint32(tokenType);

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("getAllWhitelistedTokens", params);
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return dataDecoded[0] as string[];
    }

    // Method to add a campaigner
    async addCampaigner(newCampaigner: string): Promise<void> {
        const params = new ContractFunctionParameters().addAddress(AccountId.fromString(newCampaigner).toSolidityAddress());

        await this.hederaContract.callContractWithStateChange("addCampaigner", params);
    }

    // Method to get fungible token balance
    async getFungibleTokenBalance(campaigner: string, tokenId: string): Promise<number> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addAddress(AccountId.fromString(tokenId).toSolidityAddress())
            .addUint32(1); // 1 for FUNGIBLE

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("getFungibleTokenBalance", params);
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return dataDecoded[0];
    }

    // Method to get NFT token balance
    async getNFTTokenBalance(campaigner: string, tokenId: string): Promise<number> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addAddress(AccountId.fromString(tokenId).toSolidityAddress())
            .addUint32(2); // 2 for NFT

        const { dataDecoded } = await this.hederaContract.callContractReadOnly("getNFTTokenBalance", params);
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
}


export const utilsHandlerService = new UtilsHandler();
export default UtilsHandler;