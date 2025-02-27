import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import logger from 'jet-logger';
import { AppConfig } from 'src/@types/AppConfig';
import { ConfigurationFactory } from 'src/server/provideres';

class AppConfigManager {
    private static instance: AppConfigManager;
    private secretsManager = new SecretsManager({ region: 'us-east-1' });
    private configFactory: ConfigurationFactory<AppConfig>;
    private cachedConfig: AppConfig | null = null;
    private cacheTimestamp: number | null = null;
    private readonly CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

    private constructor() {
        this.configFactory = new ConfigurationFactory<AppConfig>({
            log: logger,
            secretsManagerClient: this.secretsManager,
            builder: (provider) => ({
                app: {
                    port: provider.envAsNumber('PORT', 4000),
                    adminAddresses: provider.env('ADMIN_ADDRESS'),
                    openAIKey: provider.env('OPEN_AI_KEY'),
                    defaultRewardClaimDuration: provider.envAsNumber('REWARD_CALIM_DURATION', 7),
                    defaultCampaignDuratuon: provider.envAsNumber('CAMPAIGN_DURATION', 7),
                    appURL: provider.env('FRONTEND_URL'),
                    xCallBackHost: provider.env('TWITTER_CALLBACK_HOST'),
                    whitelistedDomains: provider.env("FRONTEND_URL"),
                    mirrorNodeURL: provider.env("MIRROR_NODE")
                },
                encryptions: {
                    jwtSecreatForAccessToken: provider.env('J_ACCESS_TOKEN_SECRET'),
                    jwtSecreateForRefreshToken: provider.env('J_REFRESH_TOKEN_SECRET'),
                    encryptionKey: provider.env('ENCRYPTION_KEY'),
                    sessionSecreat: provider.env('SESSION_SECRET'),
                },
                repo: {
                    repo: provider.env('REPO'),
                    repoClientID: provider.env('REPO_CLIENT_ID'),
                    repoClientSecret: provider.env('REPO_CLIENT_SECRET'),
                },
                db: {
                    dbServerURI: provider.env('DATABASE_URL'),
                    redisServerURI: provider.env('REDIS_URL'),
                },
                xApp: {
                    xAPIKey: provider.env('TWITTER_API_KEY'),
                    xAPISecreate: provider.env('TWITTER_API_SECRET'),
                    xUserToken: provider.env('TWITTER_APP_USER_TOKEN'), // This is X App variable extention
                    xHashbuzzAccAccessToken: provider.env('HASHBUZZ_ACCESS_TOKEN'),
                    xHashbuzzAccSecreateToken: provider.env('HASHBUZZ_ACCESS_SECRET'),
                },
                network: {
                    network: provider.env('HEDERA_NETWORK'),
                    privateKey: provider.env('HEDERA_PRIVATE_KEY'),
                    publicKey: provider.env('HEDERA_PUBLIC_KEY'),
                    contractAddress: provider.env('HASHBUZZ_CONTRACT_ADDRESS'),
                    accountID: provider.env("HEDERA_ACCOUNT_ID")
                },
                bucket:{
                    accessKeyId: provider.env("BUCKET_ACCESS_KEY_ID"),
                    secretAccessKey: provider.env("BUCKET_SECRET_ACCESS_KEY"),
                    region: provider.env("BUCKET_REGION"),
                    bucketName: provider.env("BUCKET_NAME"),
                    endpoint: provider.env("BUCKET_ENDPOINT")
                }
            }),
        });

        this.loadConfig(); // Load configuration at startup
    }

    public static getInstance(): AppConfigManager {
        if (!AppConfigManager.instance) {
            AppConfigManager.instance = new AppConfigManager();
        }
        return AppConfigManager.instance;
    }

    private async loadConfig() {
        this.cachedConfig = await this.configFactory.getConfiguration();
        this.cacheTimestamp = Date.now();
    }

    private isCacheValid(): boolean {
        if (!this.cacheTimestamp) return false;
        return (Date.now() - this.cacheTimestamp) < this.CACHE_DURATION_MS;
    }

    public async getConfig(): Promise<AppConfig> {
        if (!this.cachedConfig || !this.isCacheValid()) {
            await this.loadConfig();
        }
        return this.cachedConfig!;
    }
}

export default AppConfigManager.getInstance();


