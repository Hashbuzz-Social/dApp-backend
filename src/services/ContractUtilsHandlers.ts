import { AccountId, ContractFunctionParameters, Status } from "@hashgraph/sdk";
import { ethers } from "ethers";
import { Utils } from "../contractsV201";
import HederaContract from "./Contract";

const utilsAbi = Utils.abi as ethers.InterfaceAbi;

const transactionMemo = {
    "associateToken": "ħbuzz_UV201_1",
    "addCampaigner": "ħbuzz_UV201_2",
}

// Smart contract error codes mapping
const SMART_CONTRACT_ERRORS = {
    "E001": "Invalid token address",
    "E002": "Invalid campaign address",
    "E003": "Campaigner not allowed",
    "E004": "Campaign not closed",
    "E005": "Token not whitelisted",
    "E006": "Campaign already exists",
    "E007": "Current balance is non-zero",
    "E008": "Insufficient balance",
    "E009": "Non-zero balance",
    "E010": "Invalid expiry time",
    "E011": "Total amount must be greater than zero",
    "E012": "Mismatched input arrays",
    "E013": "Total reward exceeds campaign balance",
    "E014": "Campaign already closed",
    "E015": "Token is not fungible",
    "E016": "Invalid token type",
    "E017": "Campaign expiry time not passed"
};

// Helper function to extract error code from contract error message
function extractErrorCode(errorMessage: string): string | null {
    // Look for error codes E001-E017 in the error message
    const errorCodeMatch = errorMessage.match(/E0(0[1-9]|1[0-7])/);
    return errorCodeMatch ? errorCodeMatch[0] : null;
}

// Enhanced error class for contract errors
class ContractError extends Error {
    public errorCode?: string;
    public humanReadableMessage?: string;

    constructor(message: string, errorCode?: string) {
        super(message);
        this.name = 'ContractError';
        this.errorCode = errorCode;
        this.humanReadableMessage = errorCode ? SMART_CONTRACT_ERRORS[errorCode as keyof typeof SMART_CONTRACT_ERRORS] : undefined;
    }
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

        const response = await this.hederaContract.callContractReadOnly(
          'isTokenWhitelisted',
          params
        );

        if ('error' in response) {
          const errorCode = extractErrorCode(response.errorMessage);
          throw new ContractError(
            `Contract call failed: ${response.errorMessage}`,
            errorCode || undefined
          );
        }

        const { dataDecoded } = response;
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return Boolean(dataDecoded[0]);
    }

    // Method to associate a token
    async associateToken(tokenAddress: string, isWhitelisted: boolean): Promise<Status> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(tokenAddress).toSolidityAddress())
            .addBool(isWhitelisted);

        const contractCallResponse = await this.hederaContract.callContractWithStateChange("associateToken", params, transactionMemo.associateToken);
        if (!contractCallResponse) {
            throw new Error("contractCallResponse is undefined");
        }
        if (contractCallResponse.error) {
          throw new Error(
            `Contract call failed: ${
              contractCallResponse.errorMessage || 'Unknown error'
            }`
          );
        }
        return contractCallResponse.status as Status;
    }

    // Method to get all whitelisted tokens
    async getAllWhitelistedTokens(): Promise<string[]> {
        const params = new ContractFunctionParameters();

        const response = await this.hederaContract.callContractReadOnly(
          'getAllWhitelistedTokens',
          params
        );

        if ('error' in response) {
          const errorCode = extractErrorCode(response.errorMessage);
          throw new ContractError(
            `Contract call failed: ${response.errorMessage}`,
            errorCode || undefined
          );
        }

        const { dataDecoded } = response;
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return dataDecoded[0] as string[];
    }

    // Method to add a campaigner
    async addCampaigner(newCampaigner: string): Promise<Status> {
        const params = new ContractFunctionParameters().addAddress(AccountId.fromString(newCampaigner).toSolidityAddress());
        const response = await this.hederaContract.callContractWithStateChange("addCampaigner", params, transactionMemo.addCampaigner);
        if (!response) {
            throw new Error("response is undefined");
        }
        if (response.error) {
          throw new Error(
            `Contract call failed: ${response.errorMessage || 'Unknown error'}`
          );
        }
        return response.status as Status;
    }

    // Method to get fungible token balance
    async getFungibleTokenBalance(campaigner: string, tokenId: string): Promise<number> {
        const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addAddress(AccountId.fromString(tokenId).toSolidityAddress());

        const response = await this.hederaContract.callContractReadOnly(
          'getFungibleTokenBalance',
          params
        );

        if ('error' in response) {
          const errorCode = extractErrorCode(response.errorMessage);
          throw new ContractError(
            `Contract call failed: ${response.errorMessage}`,
            errorCode || undefined
          );
        }

        const { dataDecoded } = response;
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return Number(dataDecoded[0]);
    }

    // Method to get HBAR balance
    async getHbarBalance(campaigner: string): Promise<number> {
        const params = new ContractFunctionParameters().addAddress(AccountId.fromString(campaigner).toSolidityAddress());

        const response = await this.hederaContract.callContractReadOnly(
          'getHbarBalance',
          params
        );

        if ('error' in response) {
          const errorCode = extractErrorCode(response.errorMessage);
          throw new ContractError(
            `Contract call failed: ${response.errorMessage}`,
            errorCode || undefined
          );
        }

        const { dataDecoded } = response;
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return Number(dataDecoded[0]);
    }

    // Method to get campaign balance
    async getCampaignBalance(campaignAddress: string): Promise<number> {
        const params = new ContractFunctionParameters().addString(campaignAddress);

        const response = await this.hederaContract.callContractReadOnly(
          'getCampaignBalance',
          params
        );

        if ('error' in response) {
          const errorCode = extractErrorCode(response.errorMessage);
          throw new ContractError(
            `Contract call failed: ${response.errorMessage}`,
            errorCode || undefined
          );
        }

        const { dataDecoded } = response;
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return Number(dataDecoded[0]);
    }
    // Method to get fungible token campaign balance
    async getFungibleCampaignBalance(campaignAddress: string, tokenId: string): Promise<number> {
        const params = new ContractFunctionParameters().addString(campaignAddress).addAddress(AccountId.fromString(tokenId).toSolidityAddress());

        const response = await this.hederaContract.callContractReadOnly(
          'getFungibleCampaignBalance',
          params
        );

        if ('error' in response) {
          const errorCode = extractErrorCode(response.errorMessage);
          throw new ContractError(
            `Contract call failed: ${response.errorMessage}`,
            errorCode || undefined
          );
        }

        const { dataDecoded } = response;
        if (!dataDecoded) {
            throw new Error("dataDecoded is null");
        }
        return Number(dataDecoded[0]);
    }
}

export const utilsHandlerService = new ContractUtils();
export { ContractError };
export default ContractUtils;
