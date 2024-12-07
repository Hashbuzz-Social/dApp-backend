import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import logger from 'jet-logger';
import { AppConfig } from './@types/AppConfig';
import { ConfigurationFactory } from './server/provideres';

const secretsManager = new SecretsManager({ region: 'us-east-1' });

let cachedConfig: AppConfig | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // Cache duration in milliseconds (e.g., 24 hours)

const configFactory = new ConfigurationFactory<AppConfig>({
    log: logger,
    secretsManagerClient: secretsManager,
    builder: (provider) => ({
        app: {
            port: provider.envAsNumber('PORT', 4000),
            adminAddresses: provider.secret('ADMIN_ADDRESS'),
            openAIKey: provider.secret('OPEN_AI_KEY'),
            defaultRewardClaimDuration: provider.envAsNumber('REWARD_CALIM_DURATION', 7),
            defaultCampaignDuratuon: provider.envAsNumber('CAMPAIGN_DURATION', 7),
            appURL: provider.env('FRONTEND_URL'),
            xCallBackHost: provider.env('TWITTER_CALLBACK_HOST'),
            whitelistedDomains: provider.env("FRONTEND_URL"),
            mirrorNodeURL: provider.env("MIRROR_NODE")
        },
        encryptions: {
            jwtSecreatForAccessToken: provider.secret('J_ACCESS_TOKEN_SECRET'),
            jwtSecreateForRefreshToken: provider.secret('J_REFRESH_TOKEN_SECRET'),
            encryptionKey: provider.secret('ENCRYPTION_KEY'),
            sessionSecreat: provider.secret('SESSION_SECRET'),
        },
        repo: {
            repo: provider.env('REPO'),
            repoClientID: provider.secret('REPO_CLIENT_ID'),
            repoClientSecret: provider.secret('REPO_CLIENT_SECRET'),
        },
        db: {
            dbServerURI: provider.secret('DATABASE_URL'),
            redisServerURI: provider.secret('REDIS_URL'),
        },
        xApp: {
            xAPIKey: provider.secret('TWITTER_API_KEY'),
            xAPISecreate: provider.secret('TWITTER_API_SECRET'),
            xUserToken: provider.secret('TWITTER_APP_USER_TOKEN'), // This is X App variable extention
            xHashbuzzAccAccessToken: provider.secret('HASHBUZZ_ACCESS_TOKEN'),
            xHashbuzzAccSecreateToken: provider.secret('HASHBUZZ_ACCESS_SECRET'),
        },
        network: {
            network: provider.env('HEDERA_NETWORK'),
            privateKey: provider.secret('HEDERA_PRIVATE_KEY'),
            publicKey: provider.secret('HEDERA_PUBLIC_KEY'),
            contractAddress: provider.secret('HASHBUZZ_CONTRACT_ADDRESS'),
            accountID: provider.secret("HEDERA_ACCOUNT_ID")
        },
    }),
});

const loadConfig = async () => {
    cachedConfig = await configFactory.getConfiguration();
    cacheTimestamp = Date.now();
};

const isCacheValid = (): boolean => {
    if (!cacheTimestamp) return false;
    return (Date.now() - cacheTimestamp) < CACHE_DURATION_MS;
};

export const getConfig = async (): Promise<AppConfig> => {
    if (!cachedConfig || !isCacheValid()) {
        await loadConfig();
    }
    return cachedConfig!;
};

loadConfig(); // Load configuration at startup
