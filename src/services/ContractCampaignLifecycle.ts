import { ContractFunctionParameters, AccountId } from "@hashgraph/sdk";
import { ethers } from "ethers";
import HederaContract from "./Contract";// Adjust the import path as needed
import { CampaignLifecycle } from "../../contractsV201"; // Adjust the import path as needed

const lifecycleAbi = CampaignLifecycle.abi as ethers.InterfaceAbi;

export const CampaignLifecycleCommandsMemo = {
    "addCampaign": "ħbuzz_CLCV201_1",
    "addFungibleCampaign": "ħbuzz_CLCV201_2",
    "addNFTCampaign": "ħbuzz_CLCV201_3",
    "closeCampaign": "ħbuzz_CLCV201_4",
    "closeFungibleCampaign": "ħbuzz_CLCV201_5",
    "closeNFTCampaign": "ħbuzz_CLCV201_6",
    "rewardIntractors": "ħbuzz_CLCV201_7",
    "rewardIntractorsWithFungible": "ħbuzz_CLCV201_8",
    "expiryFungibleCampaign": "ħbuzz_CLCV201_9",
    "expiryCampaign": "ħbuzz_CLCV201_10"
};

const createTransactionMemo = (functionName: keyof typeof CampaignLifecycleCommandsMemo, memo?: string): string => {
    return `${CampaignLifecycleCommandsMemo[functionName]}${memo ? "_" + memo : ""}`;
};

class ContractCampaignLifecycle {
    private hederaContract: HederaContract;

    constructor() {
        this.hederaContract = new HederaContract(lifecycleAbi);
    }

    // Method to add a new campaign
    async addCampaign(campaignAddress: string, campaigner: string, amount: number): Promise<void> {
        const params = new ContractFunctionParameters()
            .addString(campaignAddress)
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addUint256(amount);

        const memo = createTransactionMemo("addCampaign");
        await this.hederaContract.callContractWithStateChange("addCampaign", params, memo);
    }

    // Method to add a new fungible campaign
    async addFungibleCampaign(tokenId: string, campaignAddress: string, campaigner: string, tokenAmount: number): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(tokenId)
            .addString(campaignAddress)
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addInt64(tokenAmount);

        const memo = createTransactionMemo("addFungibleCampaign");
        await this.hederaContract.callContractWithStateChange("addFungibleCampaign", params, memo);
    }

    // Method to add a new NFT campaign
    async addNFTCampaign(tokenId: string, campaignAddress: string, campaigner: string, tokenAmount: number): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(tokenId)
            .addString(campaignAddress)
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addInt64(tokenAmount);

        const memo = createTransactionMemo("addNFTCampaign");
        await this.hederaContract.callContractWithStateChange("addNFTCampaign", params, memo);
    }

    // Method to close a campaign with HBAR
    async closeCampaign(campaignAddress: string, campaignExpiryTime: number): Promise<void> {
        const params = new ContractFunctionParameters()
            .addString(campaignAddress)
            .addUint256(campaignExpiryTime);

        const memo = createTransactionMemo("closeCampaign");
        await this.hederaContract.callContractWithStateChange("closeCampaign", params, memo);
    }

    // Method to close a campaign with fungible tokens
    async closeFungibleCampaign(campaignAddress: string, campaignExpiryTime: number): Promise<void> {
        const params = new ContractFunctionParameters()
            .addString(campaignAddress)
            .addUint256(campaignExpiryTime);

        const memo = createTransactionMemo("closeFungibleCampaign");
        await this.hederaContract.callContractWithStateChange("closeFungibleCampaign", params, memo);
    }

    // Method to close a campaign with NFT tokens
    async closeNFTCampaign(campaignAddress: string, campaignExpiryTime: number): Promise<void> {
        const params = new ContractFunctionParameters()
            .addString(campaignAddress)
            .addUint256(campaignExpiryTime);

        const memo = createTransactionMemo("closeNFTCampaign");
        await this.hederaContract.callContractWithStateChange("closeNFTCampaign", params, memo);
    }

    // Method to reward intractors with HBAR
    async rewardIntractors(campaigner: string, campaignAddress: string, totalAmount: number, receiversAddresses: string[], amounts: number[]): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addString(campaignAddress)
            .addUint256(totalAmount)
            .addAddressArray(receiversAddresses.map(addr => AccountId.fromString(addr).toSolidityAddress()))
            .addUint256Array(amounts);

        const memo = createTransactionMemo("rewardIntractors");
        await this.hederaContract.callContractWithStateChange("rewardIntractors", params, memo);
    }

    // Method to reward intractors with fungible tokens
    async rewardIntractorsWithFungible(tokenId: string, campaigner: string, campaignAddress: string, tokenTotalAmount: number, tokenType: number, receiversAddresses: string[], amounts: number[]): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(tokenId)
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addString(campaignAddress)
            .addInt64(tokenTotalAmount)
            .addUint32(tokenType)
            .addAddressArray(receiversAddresses.map(addr => AccountId.fromString(addr).toSolidityAddress()))
            .addUint256Array(amounts);

        const memo = createTransactionMemo("rewardIntractorsWithFungible");
        await this.hederaContract.callContractWithStateChange("rewardIntractorsWithFungible", params, memo);
    }

    // Method to expire a campaign with fungible tokens
    async expiryFungibleCampaign(tokenId: string, campaignAddress: string, campaigner: string, tokenType: number): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(tokenId)
            .addString(campaignAddress)
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addUint32(tokenType);

        const memo = createTransactionMemo("expiryFungibleCampaign");
        await this.hederaContract.callContractWithStateChange("expiryFungibleCampaign", params, memo);
    }

    // Method to expire a campaign with HBAR
    async expiryCampaign(campaignAddress: string, campaigner: string): Promise<void> {
        const params = new ContractFunctionParameters()
            .addString(campaignAddress)
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress());

        const memo = createTransactionMemo("expiryCampaign");
        await this.hederaContract.callContractWithStateChange("expiryCampaign", params, memo);
    }
}

export default ContractCampaignLifecycle;