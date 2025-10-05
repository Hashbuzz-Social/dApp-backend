import HederaContract from "./Contract";
import { Transactions } from "../contractsV201";
import { ethers } from "ethers";
import { AccountId, ContractFunctionParameters } from "@hashgraph/sdk";

const transactionsAbi = Transactions.abi as ethers.InterfaceAbi;

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
class ContractTransactionError extends Error {
    public errorCode?: string;
    public humanReadableMessage?: string;

    constructor(message: string, errorCode?: string) {
        super(message);
        this.name = 'ContractTransactionError';
        this.errorCode = errorCode;
        this.humanReadableMessage = errorCode ? SMART_CONTRACT_ERRORS[errorCode as keyof typeof SMART_CONTRACT_ERRORS] : undefined;
    }
}

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
        try {
          const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addUint256(amount);

          const result = await this.hederaContract.callContractWithStateChange(
            'handleDeposit',
            params,
            createTransactionMemo('handleDeposit', memo)
          );

          if (!result) {
            throw new Error('Contract call returned undefined result');
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorCode = extractErrorCode(errorMessage);
          throw new ContractTransactionError(
            `Handle deposit failed: ${errorMessage}`,
            errorCode || undefined
          );
        }
    }

    // Method to handle withdrawal
    async handleWithdrawal(campaigner: string, amount: number, memo?: string): Promise<void> {
        try {
          const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addUint256(amount);

          const result = await this.hederaContract.callContractWithStateChange(
            'handleWithdrawal',
            params,
            createTransactionMemo('handleWithdrawal', memo)
          );

          if (!result) {
            throw new Error('Contract call returned undefined result');
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorCode = extractErrorCode(errorMessage);
          throw new ContractTransactionError(
            `Handle withdrawal failed: ${errorMessage}`,
            errorCode || undefined
          );
        }
    }

    // Method to update balance (top-up or reimbursement)
    async updateBalance(campaigner: string, amount: number, deposit: boolean, memo?: string): Promise<number> {
        try {
          const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addUint256(amount)
            .addBool(deposit);

          const result = await this.hederaContract.callContractWithStateChange(
            'updateBalance',
            params,
            createTransactionMemo('updateBalance', memo)
          );

          if (!result) {
            throw new Error('Contract call returned undefined result');
          }

          if ('dataDecoded' in result && result.dataDecoded) {
            return Number(result.dataDecoded[0]);
          }

          throw new Error('Failed to decode contract response data');
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorCode = extractErrorCode(errorMessage);
          throw new ContractTransactionError(
            `Update balance failed: ${errorMessage}`,
            errorCode || undefined
          );
        }
    }

    // Method to add fungible amount
    async addFungibleAmount(campaigner: string, tokenId: string, tokenAmount: number, memo?: string): Promise<number> {
        try {
          const params = new ContractFunctionParameters()
            .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
            .addAddress(AccountId.fromString(tokenId).toSolidityAddress())
            .addUint256(tokenAmount);

          const result = await this.hederaContract.callContractWithStateChange(
            'addFungibleAmount',
            params,
            createTransactionMemo('addFungibleAmount', memo)
          );

          if (!result) {
            throw new Error('Contract call returned undefined result');
          }

          if ('dataDecoded' in result && result.dataDecoded) {
            return Number(result.dataDecoded[0]);
          }

          throw new Error('Failed to decode contract response data');
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorCode = extractErrorCode(errorMessage);
          throw new ContractTransactionError(
            `Add fungible amount failed: ${errorMessage}`,
            errorCode || undefined
          );
        }
    }

    // Method to reimburse balance for fungible tokens
    async reimburseBalanceForFungible(
        tokenId: string,
        campaigner: string,
        amount: number,
        memo?: string
    ): Promise<number> {
        try {
            const params = new ContractFunctionParameters()
              .addAddress(AccountId.fromString(tokenId).toSolidityAddress())
              .addAddress(AccountId.fromString(campaigner).toSolidityAddress())
              .addUint256(amount);

            const result =
              await this.hederaContract.callContractWithStateChange(
                'reimburseBalanceForFungible',
                params,
                createTransactionMemo('reimburseBalanceForFungible', memo)
              );

            if (!result) {
              throw new Error('Contract call returned undefined result');
            }

            if ('dataDecoded' in result && result.dataDecoded) {
              return Number(result.dataDecoded[0]);
            }

            throw new Error("Failed to decode contract response data");
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorCode = extractErrorCode(errorMessage);
          throw new ContractTransactionError(
            `Reimburse balance for fungible failed: ${errorMessage}`,
            errorCode || undefined
          );
        }
    }
}

export const contractTransactionHandler = new ContractTransactions();
export { ContractTransactionError };
export default ContractTransactions;
