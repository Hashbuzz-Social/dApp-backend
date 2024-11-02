import { ContractFunctionParameters, AccountId } from "@hashgraph/sdk";
import { ethers } from "ethers";
import HederaContract from "./Contract";
import { CampaignLifecycle } from "../../contractsV201";

const lifecycleAbi = CampaignLifecycle.abi as ethers.InterfaceAbi;

export const CampaignLifecycleCommandsMemo = {
    "addCampaign": "ħbuzz_CLCV201_1",
    "addFungibleCampaign": "ħbuzz_CLCV201_2",
    "addNFTCampaign": "ħbuzz_CLCV201_3",
    "closeCampaign": "ħbuzz_CLCV201_4",
    "closeFungibleCampaign": "ħbuzz_CLCV201_5",
    "closeNFTCampaign": "ħbuzz_CLCV201_6",
    "adjustTotalReward": "ħbuzz_CLCV201_7",
    "adjustTotalFungibleReward": "ħbuzz_CLCV201_8",
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
    async addCampaign(campaignAddress: string, campaigner: string, amount: number) {
        const params = new ContractFunctionParameters()
            .addString(campaignAddress)
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addUint256(amount);

        const memo = createTransactionMemo("addCampaign");
        const response = await this.hederaContract.callContractWithStateChange("addCampaign", params, memo);
        return response;
    }

    // Method to add a new fungible campaign
    async addFungibleCampaign(tokenId: string, campaignAddress: string, campaigner: string, tokenAmount: number) {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(tokenId).toSolidityAddress())
            .addString(campaignAddress)
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addInt64(tokenAmount);

        const memo = createTransactionMemo("addFungibleCampaign");
        await this.hederaContract.callContractWithStateChange("addFungibleCampaign", params, memo);
        const response = await this.hederaContract.callContractWithStateChange("addCampaign", params, memo);
        return response;
    }

    // Method to add a new NFT campaign
    async addNFTCampaign(tokenId: string, campaignAddress: string, campaigner: string, tokenAmount: number): Promise<void> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(tokenId).toSolidityAddress())
            .addString(campaignAddress)
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addInt64(tokenAmount);

        const memo = createTransactionMemo("addNFTCampaign");
        await this.hederaContract.callContractWithStateChange("addNFTCampaign", params, memo);
    }

    // Method to close a campaign with HBAR
    async closeCampaign(campaignAddress: string, campaignExpiryTime: number) {
        const params = new ContractFunctionParameters()
            .addString(campaignAddress)
            .addUint256(campaignExpiryTime);

        const memo = createTransactionMemo("closeCampaign");
        const closeResponse = await this.hederaContract.callContractWithStateChange("closeCampaign", params, memo);
        return closeResponse;
    }

    // Method to close a campaign with fungible tokens
    async closeFungibleCampaign(campaignAddress: string, campaignExpiryTime: number) {
        const params = new ContractFunctionParameters()
            .addString(campaignAddress)
            .addUint256(campaignExpiryTime);

        const memo = createTransactionMemo("closeFungibleCampaign");
        const closeResponse = await this.hederaContract.callContractWithStateChange("closeFungibleCampaign", params, memo);
        return closeResponse;
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
    async adjustTotalReward(campaigner: string, campaignAddress: string, totalAmount: number) {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addString(campaignAddress)
            .addUint256(totalAmount)

        const memo = createTransactionMemo("adjustTotalReward");
        const response = await this.hederaContract.callContractWithStateChange("adjustTotalReward", params, memo);
        return response;
    }

    // Method to reward intractors with fungible tokens
    async adjustTotalFungibleReward(tokenId: string, campaigner: string, campaignAddress: string, tokenTotalAmount: number, tokenType: number) {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(tokenId).toSolidityAddress())
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addString(campaignAddress)
            .addInt64(tokenTotalAmount)
            .addUint32(tokenType)

        const memo = createTransactionMemo("adjustTotalFungibleReward");
        const response = await this.hederaContract.callContractWithStateChange("adjustTotalFungibleReward", params, memo);
        return response;
    }

    // Method to expire a campaign with fungible tokens
    async expiryFungibleCampaign(tokenId: string, campaignAddress: string, campaigner: string, tokenType: number) {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(tokenId).toSolidityAddress())
            .addString(campaignAddress)
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addUint32(tokenType);

        const memo = createTransactionMemo("expiryFungibleCampaign");
        const expiryResponse = await this.hederaContract.callContractWithStateChange("expiryFungibleCampaign", params, memo);

        return expiryResponse;
    }

    // Method to expire a campaign with HBAR
    async expiryCampaign(campaignAddress: string, campaigner: string) {
        const params = new ContractFunctionParameters()
            .addString(campaignAddress)
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress());

        const memo = createTransactionMemo("expiryCampaign");
        const expiryResponse = await this.hederaContract.callContractWithStateChange("expiryCampaign", params, memo);
        return expiryResponse;
    }
}

export const campaignLifecycleService = new ContractCampaignLifecycle();
export default ContractCampaignLifecycle;