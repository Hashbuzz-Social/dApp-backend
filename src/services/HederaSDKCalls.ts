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
} from "@hashgraph/sdk";
import hederaService from "./hedera-service";

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
}


export const hederaSDKCallHandler = new HederaSDKCalls();
export default HederaSDKCalls;