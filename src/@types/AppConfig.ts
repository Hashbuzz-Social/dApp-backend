export interface AppConfig {
    app: {
        /** App port number */
        port: number
        /** Hedera network wallet ID which will be the app default admin */
        adminAddresses: string
        /** OpenAI API key */
        openAIKey: string
        /** Default app config for reward claim duration in days */
        defaultRewardClaimDuration: number,
        /** Default app config for campaign duration in days */
        defaultCampaignDuratuon: number,
        /** App frontend URL */
        appURL: string,
        /** App backend callback URL */
        xCallBackHost: string;

        /** App config */

        whitelistedDomains: string

        mirrorNodeURL: string
    }

    encryptions: {
        /** JWT secret for access token */
        jwtSecreatForAccessToken: string
        /** JWT secret for refresh token */
        jwtSecreateForRefreshToken: string
        /** Database storage encryption key */
        encryptionKey: string
        /** Session secret for key rotation */
        sessionSecreat: string
    }

    repo: {
        /** Git repository */
        repo: string,
        /** Git repository client ID */
        repoClientID: string,
        /** Git repository client secret */
        repoClientSecret: string
    }

    db: {
        /** PostgreSQL database URI */
        dbServerURI: string,
        /** Redis server URI */
        redisServerURI: string,
    }

    xApp: {
        /** Twitter API key */
        xAPIKey: string,
        /** Twitter API secret */
        xAPISecreate: string,
        /** Twitter app user token */
        xUserToken: string,
        /** Hashbuzz account access token */
        xHashbuzzAccAccessToken: string,
        /** Hashbuzz account secret token */
        xHashbuzzAccSecreateToken: string
    }

    network: {
        /** Network type: testnet or mainnet */
        network: string,
        /** Private key for the network */
        privateKey: string,
        /** Public key for the network */
        publicKey: string,
        /** Contract address on the network */
        contractAddress: string,
        /** Account id */
        accountID: string;
    },
    aws:{
        /** AWS access key ID */
        accessKeyId: string,
        /** AWS secret access key */
        secretAccessKey: string,
        /** AWS region */
        region: string
        /** AWS S3 bucket name */
        bucketName: string
    }
}
