import { ContractFunctionParameters, AccountId } from "@hashgraph/sdk";
import { ethers } from "ethers";
import HederaContract from "./Contract";
import { CampaignLifecycle } from "../contractsV201";

const lifecycleAbi = CampaignLifecycle.abi as ethers.InterfaceAbi;

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
class ContractCampaignLifecycleError extends Error {
    public errorCode?: string;
    public humanReadableMessage?: string;

    constructor(message: string, errorCode?: string) {
        super(message);
        this.name = 'ContractCampaignLifecycleError';
        this.errorCode = errorCode;
        this.humanReadableMessage = errorCode ? SMART_CONTRACT_ERRORS[errorCode as keyof typeof SMART_CONTRACT_ERRORS] : undefined;
    }
}

export const CampaignLifecycleCommandsMemo = {
    "addCampaignOrTopUp": "ħbuzz_CLCV201_1",
    "addFungibleCampaign": "ħbuzz_CLCV201_2",
    "closeCampaign": "ħbuzz_CLCV201_4",
    "closeFungibleCampaign": "ħbuzz_CLCV201_5",
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

  constructor(contractId?: string) {
    this.hederaContract = new HederaContract(lifecycleAbi, contractId);
  }

  // Method to add a new campaign
  async addCampaignOrTopUp(
    campaignAddress: string,
    campaigner: string,
    amount: number
  ) {
    try {
      if (this.hederaContract.contract_id === undefined) {
        throw new Error('Contract ID is undefined');
      }

      const params = new ContractFunctionParameters()
        .addString(campaignAddress)
        .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
        .addUint256(amount);

      const memo = createTransactionMemo('addCampaignOrTopUp');
      const response = await this.hederaContract.callContractWithStateChange(
        'addCampaignOrTopUp',
        params,
        memo
      );

      if (!response) {
        throw new Error('Contract call returned undefined result');
      }

      return response;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = extractErrorCode(errorMessage);
      throw new ContractCampaignLifecycleError(
        `Add campaign or top up failed: ${errorMessage}`,
        errorCode || undefined
      );
    }
  }

  // Method to add a new fungible campaign
  async addFungibleCampaign(
    tokenId: string,
    campaignAddress: string,
    campaigner: string,
    tokenAmount: number
  ) {
    try {
      const params = new ContractFunctionParameters()
        .addAddress(AccountId.fromString(tokenId).toSolidityAddress())
        .addString(campaignAddress)
        .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
        .addUint256(tokenAmount);

      const memo = createTransactionMemo('addFungibleCampaign');
      const response = await this.hederaContract.callContractWithStateChange(
        'addFungibleCampaign',
        params,
        memo
      );

      if (!response) {
        throw new Error('Contract call returned undefined result');
      }

      return response;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = extractErrorCode(errorMessage);
      throw new ContractCampaignLifecycleError(
        `Add fungible campaign failed: ${errorMessage}`,
        errorCode || undefined
      );
    }
  }

  // Method to close a campaign with HBAR
  async closeCampaign(campaignAddress: string, campaignExpiryTime: number) {
    try {
      const params = new ContractFunctionParameters()
        .addString(campaignAddress)
        .addUint256(campaignExpiryTime);

      const memo = createTransactionMemo('closeCampaign');
      const closeResponse =
        await this.hederaContract.callContractWithStateChange(
          'closeCampaign',
          params,
          memo
        );

      if (!closeResponse) {
        throw new Error('Contract call returned undefined result');
      }

      return closeResponse;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = extractErrorCode(errorMessage);
      throw new ContractCampaignLifecycleError(
        `Close campaign failed: ${errorMessage}`,
        errorCode || undefined
      );
    }
  }

  // Method to close a campaign with fungible tokens
  async closeFungibleCampaign(
    campaignAddress: string,
    campaignExpiryTime: number
  ) {
    try {
      const params = new ContractFunctionParameters()
        .addString(campaignAddress)
        .addUint256(campaignExpiryTime);

      const memo = createTransactionMemo('closeFungibleCampaign');
      const closeResponse =
        await this.hederaContract.callContractWithStateChange(
          'closeFungibleCampaign',
          params,
          memo
        );

      if (!closeResponse) {
        throw new Error('Contract call returned undefined result');
      }

      return closeResponse;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = extractErrorCode(errorMessage);
      throw new ContractCampaignLifecycleError(
        `Close fungible campaign failed: ${errorMessage}`,
        errorCode || undefined
      );
    }
  }

  // Method to reward intractors with HBAR
  async adjustTotalReward(props: {
    campaigner: string;
    campaignAddress: string;
    totalAmount: number;
  }) {
    try {
      const { campaigner, campaignAddress, totalAmount } = props;
      const params = new ContractFunctionParameters()
        .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
        .addString(campaignAddress)
        .addUint256(totalAmount);

      const memo = createTransactionMemo('adjustTotalReward');
      const response = await this.hederaContract.callContractWithStateChange(
        'adjustTotalReward',
        params,
        memo
      );

      if (!response) {
        throw new Error('Contract call returned undefined result');
      }

      return response;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = extractErrorCode(errorMessage);
      throw new ContractCampaignLifecycleError(
        `Adjust total reward failed: ${errorMessage}`,
        errorCode || undefined
      );
    }
  }

  // Method to reward intractors with fungible tokens
  async adjustTotalFungibleReward(props: {
    tokenId: string;
    campaigner: string;
    campaignAddress: string;
    tokenTotalAmount: number;
  }) {
    try {
      const { tokenId, campaigner, campaignAddress, tokenTotalAmount } = props;
      const params = new ContractFunctionParameters()
        .addAddress(AccountId.fromString(tokenId).toSolidityAddress())
        .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
        .addString(campaignAddress)
        .addUint256(tokenTotalAmount);

      const memo = createTransactionMemo('adjustTotalFungibleReward');
      const response = await this.hederaContract.callContractWithStateChange(
        'adjustTotalFungibleReward',
        params,
        memo
      );

      if (!response) {
        throw new Error('Contract call returned undefined result');
      }

      return response;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = extractErrorCode(errorMessage);
      throw new ContractCampaignLifecycleError(
        `Adjust total fungible reward failed: ${errorMessage}`,
        errorCode || undefined
      );
    }
  }

  // Method to expire a campaign with fungible tokens
  async expiryFungibleCampaign(props: {
    tokenId: string;
    campaignAddress: string;
    campaigner: string;
  }) {
    try {
      const { tokenId, campaignAddress, campaigner } = props;
      const params = new ContractFunctionParameters()
        .addAddress(AccountId.fromString(tokenId).toSolidityAddress())
        .addString(campaignAddress)
        .addAddress(AccountId.fromString(campaigner).toSolidityAddress());

      const memo = createTransactionMemo('expiryFungibleCampaign');
      const expiryResponse =
        await this.hederaContract.callContractWithStateChange(
          'expiryFungibleCampaign',
          params,
          memo
        );

      if (!expiryResponse) {
        throw new Error('Contract call returned undefined result');
      }

      return expiryResponse;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = extractErrorCode(errorMessage);
      throw new ContractCampaignLifecycleError(
        `Expiry fungible campaign failed: ${errorMessage}`,
        errorCode || undefined
      );
    }
  }

  // Method to expire a campaign with HBAR
  async expiryCampaign(campaignAddress: string, campaigner: string) {
    try {
      const params = new ContractFunctionParameters()
        .addString(campaignAddress)
        .addAddress(AccountId.fromString(campaigner).toSolidityAddress());

      const memo = createTransactionMemo('expiryCampaign');
      const expiryResponse =
        await this.hederaContract.callContractWithStateChange(
          'expiryCampaign',
          params,
          memo
        );

      if (!expiryResponse) {
        throw new Error('Contract call returned undefined result');
      }

      return expiryResponse;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = extractErrorCode(errorMessage);
      throw new ContractCampaignLifecycleError(
        `Expiry campaign failed: ${errorMessage}`,
        errorCode || undefined
      );
    }
  }
}

export const campaignLifecycleService = new ContractCampaignLifecycle();
export { ContractCampaignLifecycleError };
export default ContractCampaignLifecycle;
