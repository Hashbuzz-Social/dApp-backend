import {
    Client,
    TokenAssociateTransaction,
    TokenCreateTransaction,
    TokenInfoQuery,
    AccountId,
    PrivateKey,
    Status,
    TokenType,
    TokenSupplyType,
    TokenInfo,
    TransferTransaction,
    TokenId,
} from "@hashgraph/sdk";
import hederaService from "./hedera-service";
import { provideActiveContract } from "./contract-service";

const trasctionMemos = {
    "transferHbarUsingSDK": "ħbuzz_TSDK",
    "transferTokenUsingSDK": "ħbuzz_TSDK_Token",
}

class HederaSDKCalls {
    private client: Client;
    private operatorId: AccountId;
    private operatorKey: PrivateKey;

    constructor() {
        this.operatorId = hederaService.operatorId;
        this.operatorKey = hederaService.operatorKey;
        this.client = hederaService.hederaClient;
    }

    // Method to associate a token with an account
    async associateToken(accountId: string, tokenId: string): Promise<Status> {
        const associateTransaction = new TokenAssociateTransaction()
            .setAccountId(AccountId.fromString(accountId))
            .setTokenIds([tokenId])
            .freezeWith(this.client);

        const signTx = await associateTransaction.sign(this.operatorKey);
        const associateResponse = await signTx.execute(this.client);
        const associateReceipt = await associateResponse.getReceipt(this.client);

        return associateReceipt.status;
    }

    // Method to create a new token
    async createToken(
        name: string,
        symbol: string,
        decimals: number,
        initialSupply: number,
        treasuryAccountId: string
    ): Promise<string> {
        const tokenCreateTransaction = new TokenCreateTransaction()
            .setTokenName(name)
            .setTokenSymbol(symbol)
            .setDecimals(decimals)
            .setInitialSupply(initialSupply)
            .setTreasuryAccountId(AccountId.fromString(treasuryAccountId))
            .setTokenType(TokenType.FungibleCommon)
            .setSupplyType(TokenSupplyType.Finite)
            .setMaxSupply(initialSupply)
            .freezeWith(this.client);

        const signTx = await tokenCreateTransaction.sign(this.operatorKey);
        const createResponse = await signTx.execute(this.client);
        const createReceipt = await createResponse.getReceipt(this.client);

        return createReceipt.tokenId?.toString() || "";
    }

    // Method to get token details
    async getTokenDetails(tokenId: string): Promise<TokenInfo> {
        const tokenInfoQuery = new TokenInfoQuery().setTokenId(tokenId);
        const tokenInfo = await tokenInfoQuery.execute(this.client);
        return tokenInfo;
    }

    // Transafer Hbar using Hedera SDK
    async transferHbarUsingSDK(params: {
        fromAccountId: string,
        toAccountId: string,
        amount: number,
        memo?: string
    }) {
        const { fromAccountId, toAccountId, amount, memo } = params;

        // Create a transaction
        const transferTx = new TransferTransaction()
            .addHbarTransfer(AccountId.fromString(fromAccountId), -amount)
            .addHbarTransfer(AccountId.fromString(toAccountId), amount)
            .setTransactionMemo(trasctionMemos.transferHbarUsingSDK + (memo ?? ""))
            .freezeWith(this.client);

        // Sign and execute the transaction
        const transferSign = await transferTx.sign(this.operatorKey);
        const transferSubmit = await transferSign.execute(this.client);

        // Recipt of the trnasaction
        const transferRx = await transferSubmit.getReceipt(this.client);

        return transferRx;
    };

    async transferTokenUsingSDK(params: {
        fromAccountId: string,
        toAccountId: string,
        tokenId: string,
        amount: number,
        memo?: string
    }) {
        const { amount, memo } = params;
        const tokenId = TokenId.fromString(params.tokenId);
        const fromAccountId = AccountId.fromString(params.fromAccountId);
        const toAccountId = AccountId.fromString(params.toAccountId);

        const transaction = new TransferTransaction()
            .addTokenTransfer(tokenId, fromAccountId, -amount)
            .addTokenTransfer(tokenId, toAccountId, amount)
            .setTransactionMemo(trasctionMemos.transferTokenUsingSDK + (memo ?? ""))
            .freezeWith(this.client);

        //Sign with the sender account private key
        const signTx = await transaction.sign(this.operatorKey);

        //Sign with the client operator private key and submit to a Hedera network
        const txResponse = await signTx.execute(this.client);

        //Request the receipt of the transaction
        const receipt = await txResponse.getReceipt(this.client);

        //Obtain the transaction consensus status
        const transactionStatus = receipt.status;

        console.log("The transaction consensus status " + transactionStatus.toString());
        return { status: transactionStatus, receipt, tokenId: params.tokenId }
    }

    /**
     *  Method to reward the intreactor
     * @param intreactor  Hedera wallet address of the intractor example 0.0.12345
     * @param amount Total amount in tinyHBAR to reward
     * @param campaignAddress DB address of the campaign
     */
    async rewardIntractor(intreactor: string, amount: number, campaignAddress: string) {
        const contractDetails = await provideActiveContract()
        if (contractDetails?.contract_id)
            return await this.transferHbarUsingSDK({
                fromAccountId: contractDetails.contract_id,
                toAccountId: intreactor,
                amount,
                memo: `ħbuzzReward_${intreactor}_${campaignAddress}`
            });
    }

    /**
     * 
     * @param intreactor Hedera wallet address of the intractor example 0.0.12345
     * @param amount total amount in tinyHBAR to reward
     * @param campaignAddress DB address of the campaign
     * @param tokenId Token address which is going to be rewarded example 0.0.12345
     */
    async rewardIntractorWithToken(intreactor: string, amount: number, campaignAddress: string, tokenId: string) {
        const contractDetails = await provideActiveContract();
        if (contractDetails?.contract_id) {
            return await this.transferTokenUsingSDK({
                fromAccountId: contractDetails.contract_id,
                toAccountId: intreactor,
                tokenId,
                amount,
                memo: `ħbuzzTokenReward_${intreactor}_${campaignAddress}`
            });
        }
    }
}


export const hederaSDKCallHandler = new HederaSDKCalls();
export default HederaSDKCalls;