import HederaContract from "./Contract";
import { Lifecycle as CampaignLifecycle } from "../../contractsV201";
import { ethers } from "ethers";
import { ContractFunctionParameters } from "@hashgraph/sdk";

const lifecycleAbi = CampaignLifecycle.abi as ethers.InterfaceAbi;

class CampaignLifecycleHandler {
    private hederaContract: HederaContract;

    constructor() {
        this.hederaContract = new HederaContract(lifecycleAbi);
    }

    // Method to add a new campaign
    async addCampaign(campaignAddress: string, campaigner: string, amount: number): Promise<void> {
        const params = new ContractFunctionParameters()
            .addString(campaignAddress)
            .addAddress(campaigner)
            .addUint256(amount);

        await this.hederaContract.callContractWithStateChange("addCampaign", params);
    }

    // Method to add a new campaign for fungible and NFT tokens
    async addFungibleAndNFTCampaign(tokenId: string, campaignAddress: string, campaigner: string, tokenAmount: number, tokenType: 1 | 2): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(tokenId)
            .addString(campaignAddress)
            .addAddress(campaigner)
            .addInt64(tokenAmount)
            .addUint32(tokenType);

        await this.hederaContract.callContractWithStateChange("addFungibleAndNFTCampaign", params);
    }

    // Method to close a campaign with HBAR
    async closeCampaign(campaignAddress: string, campaignExpiryTime: number): Promise<void> {
        const params = new ContractFunctionParameters()
            .addString(campaignAddress)
            .addUint256(campaignExpiryTime);

        await this.hederaContract.callContractWithStateChange("closeCampaign", params);
    }

    // Method to close a campaign with fungible and NFT tokens
    async closeFungibleAndNFTCampaign(campaignAddress: string, campaignExpiryTime: number, tokenType: 1 | 2): Promise<void> {
        const params = new ContractFunctionParameters()
            .addString(campaignAddress)
            .addUint256(campaignExpiryTime)
            .addUint32(tokenType);

        await this.hederaContract.callContractWithStateChange("closeFungibleAndNFTCampaign", params);
    }

    // Method to distribute fungible tokens
    async distributeFungible(tokenId: string, campaigner: string, campaignAddress: string, tokenTotalAmount: number, tokenType: 1 | 2, receiversAddresses: string[], amounts: number[]): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(tokenId)
            .addAddress(campaigner)
            .addString(campaignAddress)
            .addInt64(tokenTotalAmount)
            .addUint32(tokenType)
            .addAddressArray(receiversAddresses)
            .addUint256Array(amounts);

        await this.hederaContract.callContractWithStateChange("distributeFungible", params);
    }

    // Method to distribute HBAR tokens
    async distributeBalance(campaigner: string, campaignAddress: string, totalAmount: number, receiversAddresses: string[], amounts: number[]): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(campaigner)
            .addString(campaignAddress)
            .addUint256(totalAmount)
            .addAddressArray(receiversAddresses)
            .addUint256Array(amounts);

        await this.hederaContract.callContractWithStateChange("distributeBalance", params);
    }

    // Method to expire a campaign with fungible and NFT tokens
    async expiryFungibleCampaign(tokenId: string, campaignAddress: string, campaigner: string, tokenType: 1 | 2): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(tokenId)
            .addString(campaignAddress)
            .addAddress(campaigner)
            .addUint32(tokenType);

        await this.hederaContract.callContractWithStateChange("expiryFungibleCampaign", params);
    }

    // Method to expire a campaign with HBAR
    async expiryCampaign(campaignAddress: string, campaigner: string): Promise<void> {
        const params = new ContractFunctionParameters()
            .addString(campaignAddress)
            .addAddress(campaigner);

        await this.hederaContract.callContractWithStateChange("expiryCampaign", params);
    }
}

export default CampaignLifecycleHandler;