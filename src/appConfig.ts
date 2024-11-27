import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import logger from "jet-logger";
import { AppConfig } from './@types/AppConfig';
import { ConfigurationFactory } from './server/provideres';

const secretsManager = new SecretsManager({ region: "us-east-1" });

const configFactory = new ConfigurationFactory<AppConfig>({
    log: logger,
    secretsManagerClient: secretsManager,
    builder: (provider) => ({
        app: {
            port: provider.envAsNumber("PORT", 4000),
            adminAddresses: provider.secret("ADMIN_ADDRESSES"),
            openAIKey: provider.secret("OPEN_AI_KEY"),
            defaultRewardClaimDuration: provider.envAsNumber("DEFAULT_REWARD_CLAIM_DURATION", 15),
            defaultCampaignDuratuon: provider.envAsNumber("DEFAULT_CAMPAIGN_DURATION", 15),
            appURL: provider.env("FRONTEND_URL", "https://hashbuzz.social"),
            xCallBackHost: provider.env("TWITTER_CALLBACK_HOST", "https://api.hashbuzz.social")
        },
        encryptions: {
            jwtSecreatForAccessToken: provider.secret("J_ACCESS_TOKEN_SECRET"),
            jwtSecreateForRefreshToken: provider.secret("J_REFRESH_TOKEN_SECRET"),
            encryptionKey: provider.secret("ENCRYPTION_KEY"),
            sessionSecreat: provider.secret("SESSION_SECRET")
        },
        repo: {
            repo: provider.env("REPO", 'hashbuzz/dApp-backend'),
            repoClientID: provider.secret("REPO_CLIENT_ID"),
            repoClientSecret: provider.secret("REPO_CLIENT_SECRET")
        },
        db: {
            dbServerURI: provider.secret("DATABASE_URL"),
            redisServerURI: provider.secret("REDIS_URL")
        },
        xApp: {
            xAPIKey: provider.secret("TWITTER_API_KEY"),
            xAPISecreate: provider.secret("TWITTER_API_SECRET"),
            xUserToken: provider.secret("TWITTER_APP_USER_TOKEN"),
            xHashbuzzAccAccessToken: provider.secret("HASHBUZZ_ACCESS_TOKEN"),
            xHashbuzzAccSecreateToken: provider.secret("HASHBUZZ_ACCESS_SECRET")
        },
        network: {
            network: provider.env("NETWORK", 'testnet'),
            privateKey: provider.secret("PRIVATE_KEY"),
            publicKey: provider.secret("PUBLIC_KEY"),
            contractAddress: provider.env("CONTRACT_ADDRESS")
        }
    }),
});

const configPromise = configFactory.getConfiguration();

export const getConfig = async () => {
    return await configPromise;
};