import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import { ILogger } from 'jet-logger';
import { AppConfig, AwsRegion, CacheEntry, Environment, HederaNetwork, LogLevel, RetryConfig } from '../../@types/AppConfig';
import { ConfigurationValidator } from './ConfigurationValidator';


export class EnhancedConfigurationFactory {
    private logger: ILogger;
    private secretsManager: SecretsManager;
    private cache: Map<string, CacheEntry> = new Map();
    private retryConfig: RetryConfig;

    constructor(config: {
        logger: ILogger;
        secretsManager: SecretsManager;
        retryConfig?: RetryConfig;
    }) {
        this.logger = config.logger;
        this.secretsManager = config.secretsManager;
        this.retryConfig = config.retryConfig || {
            maxRetries: 3,
            baseDelayMs: 1000,
            maxDelayMs: 10000
        };
    }

    async getConfiguration(): Promise<AppConfig | undefined> {
        try {
          const rawConfig = await this.buildConfiguration();

          // Validate the configuration
          const validationResult =
            ConfigurationValidator.validateConfig(rawConfig);
          if (!validationResult.isValid) {
            this.logger.err(
              `Configuration validation failed: ${validationResult.errors.join(
                ', '
              )}`
            );
            console.error(
              `Configuration validation failed: ${validationResult.errors.join(
                ', '
              )}`
            );
            return undefined;
          }

          this.logger.info('Configuration loaded and validated successfully');
          return validationResult.validatedConfig as AppConfig;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.err(`Failed to load configuration: ${errorMessage}`);
            console.error(`Configuration loading failed: ${(error as Error).message}`);
            return undefined;
        }
    }

    private async buildConfiguration(): Promise<AppConfig> {
        return {
          app: {
            port: this.getEnvAsNumber('PORT', 4000),
            adminAddresses: await this.getSecret('ADMIN_ADDRESS'),
            openAIKey: await this.getSecret('OPEN_AI_KEY'),
            defaultRewardClaimDuration: this.getEnvAsNumber(
              'REWARD_CLAIM_DURATION',
              7
            ),
            defaultCampaignDuration: this.getEnvAsNumber(
              'CAMPAIGN_DURATION',
              7
            ),
            appURL: this.getEnv('FRONTEND_URL'),
            xCallBackHost: this.getEnv('TWITTER_CALLBACK_HOST'),
            whitelistedDomains: this.getEnvAsArray(
              'WHITELISTED_DOMAINS',
              'https://www.hashbuzz.social,https://hashbuzz.social,http://localhost:3000'
            ),
            mirrorNodeURL: this.getEnv('MIRROR_NODE'),
            environment: this.getEnv('NODE_ENV', 'development') as Environment,
          },
          aws: {
            region: this.getEnv('AWS_REGION', 'us-east-1') as AwsRegion,
            secretsManager: {
              cacheTtlMs: this.getEnvAsNumber('SECRETS_CACHE_TTL_MS', 3600000), // 1 hour
              maxRetries: this.getEnvAsNumber('SECRETS_MAX_RETRIES', 3),
              retryDelayMs: this.getEnvAsNumber('SECRETS_RETRY_DELAY_MS', 1000),
            },
          },
          encryptions: {
            jwtSecretForAccessToken: await this.getSecret(
              'J_ACCESS_TOKEN_SECRET'
            ),
            jwtSecretForRefreshToken: await this.getSecret(
              'J_REFRESH_TOKEN_SECRET'
            ),
            encryptionKey: await this.getSecret('ENCRYPTION_KEY'),
            sessionSecret: await this.getSecret('SESSION_SECRET'),
            accessTokenExpiresIn: this.getEnv('ACCESS_TOKEN_EXPIRES_IN', '2m'),
            refreshTokenExpiresIn: this.getEnv(
              'REFRESH_TOKEN_EXPIRES_IN',
              '24h'
            ),
          },
          repo: {
            repo: this.getEnv('REPO'),
            repoClientID: await this.getSecret('REPO_CLIENT_ID'),
            repoClientSecret: await this.getSecret('REPO_CLIENT_SECRET'),
          },
          db: {
            dbServerURI: await this.getSecret('DATABASE_URL'),
            redisServerURI: await this.getSecret('REDIS_URL'),
            pool: {
              min: this.getEnvAsNumber('DB_POOL_MIN', 2),
              max: this.getEnvAsNumber('DB_POOL_MAX', 10),
              idleTimeoutMs: this.getEnvAsNumber(
                'DB_POOL_IDLE_TIMEOUT_MS',
                30000
              ),
            },
          },
          xApp: {
            xAPIKey: await this.getSecret('TWITTER_API_KEY'),
            xAPISecret: await this.getSecret('TWITTER_API_SECRET'),
            xUserToken: await this.getSecret('TWITTER_APP_USER_TOKEN'),
            xHashbuzzAccAccessToken: await this.getSecret(
              'HASHBUZZ_ACCESS_TOKEN'
            ),
            xHashbuzzAccSecretToken: await this.getSecret(
              'HASHBUZZ_ACCESS_SECRET'
            ),
          },
          network: {
            network: this.getEnv('HEDERA_NETWORK') as HederaNetwork,
            privateKey: await this.getSecret('HEDERA_PRIVATE_KEY'),
            publicKey: await this.getSecret('HEDERA_PUBLIC_KEY'),
            contractAddress: await this.getSecret('HASHBUZZ_CONTRACT_ADDRESS'),
            accountID: await this.getSecret('HEDERA_ACCOUNT_ID'),
          },
          bucket: {
            accessKeyId: await this.getSecret('BUCKET_ACCESS_KEY_ID'),
            secretAccessKey: await this.getSecret('BUCKET_SECRET_ACCESS_KEY'),
            region: this.getEnv('BUCKET_REGION') as AwsRegion,
            bucketName: this.getEnv('BUCKET_NAME'),
            endpoint: this.getEnv('BUCKET_ENDPOINT', ''),
          },
          mailer: {
            emailUser: this.getEnv('EMAIL_USER'),
            emailPass: await this.getSecret('EMAIL_PASS'),
            alertReceivers: this.getEnvAsArray(
              'ALERT_RECEIVERS',
              'admin@hashbuzz.social'
            ),
          },
          monitoring: {
            metricsEnabled: this.getEnvAsBoolean('METRICS_ENABLED', true),
            healthCheckPath: this.getEnv('HEALTH_CHECK_PATH', '/health'),
            logLevel: this.getEnv('LOG_LEVEL', 'info') as LogLevel,
          },
          cache: {
            configCacheTtlMs: this.getEnvAsNumber(
              'CONFIG_CACHE_TTL_MS',
              3600000
            ),
            distributedCache: this.getEnvAsBoolean(
              'DISTRIBUTED_CACHE_ENABLED',
              false
            ),
            keyPrefix: this.getEnv('CACHE_KEY_PREFIX', 'hashbuzz:'),
          },
          featureFlags: {
            enableNewAuth: this.getEnvAsBoolean('FEATURE_NEW_AUTH', false),
            enhancedLogging: this.getEnvAsBoolean(
              'FEATURE_ENHANCED_LOGGING',
              false
            ),
            rateLimiting: this.getEnvAsBoolean('FEATURE_RATE_LIMITING', true),
          },
        };
    }

    private async getSecret(secretName: string, defaultValue?: string): Promise<string> {
      const cacheKey = `secret:${secretName}`;

      // Check cache first
      const cached = this.getCachedValue(cacheKey);
      if (cached !== null) {
        return cached;
      }

      try {
        const value = await this.retryOperation(async () => {
          // Dynamically determine secret ID based on environment
          const environment = this.getEnv('NODE_ENV', 'development');
          const isOnlyLocalEnv =
            environment === 'development' &&
            this.getEnv('HEDERA_NETWORK') === HederaNetwork.TESTNET;
          const secretId =
            environment === 'production'
              ? 'Prod_Variables_V2'
              : 'Dev_Variables_V2';

          if (isOnlyLocalEnv) {
            return this.getEnv(secretName, defaultValue);
          }

          // Fetch the main secrets object
          const result = await this.secretsManager.getSecretValue({
            SecretId: secretId,
          });

          // Parse the JSON and extract the specific secret
          const secretData = JSON.parse(result.SecretString || '{}') as Record<
            string,
            string
          >;
          return secretData[secretName] || '';
        });

        if (!value) {
          if (defaultValue !== undefined) {
            this.logger.warn(
              `Secret ${secretName} not found, using default value`
            );
            return defaultValue;
          }
          console.error(
            `Secret ${secretName} not found and no default provided`
          );
        }

        // Cache the value
        this.setCachedValue(cacheKey, value, 3600000); // 1 hour cache
        return value;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.err(
          `Failed to retrieve secret ${secretName}: ${errorMessage}`
        );
        if (defaultValue !== undefined) {
          return defaultValue;
        }
        throw error;
      }
    }

    private getEnv(varName: string, defaultValue?: string): string {
        const value = process.env[varName];
        if (value !== undefined) {
            return value;
        }
        if (defaultValue !== undefined) {
          // this.logger.info(`Using default value for ${varName}`);
          return defaultValue;
        }
        console.error(`Environment variable ${varName} is required but not set`);
        return '';
    }

    private getEnvAsNumber(varName: string, defaultValue?: number): number {
        const strValue = this.getEnv(varName, defaultValue?.toString());
        const numValue = Number(strValue);
        if (isNaN(numValue)) {
            console.error(`Environment variable ${varName} must be a valid number, got: ${strValue}`);
        }
        return numValue;
    }

    private getEnvAsBoolean(varName: string, defaultValue?: boolean): boolean {
        const strValue = this.getEnv(varName, defaultValue?.toString());
        const lowerValue = strValue.toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(lowerValue)) {
            return true;
        }
        if (['false', '0', 'no', 'off'].includes(lowerValue)) {
            return false;
        }
        console.error(`Environment variable ${varName} must be a valid boolean, got: ${strValue}`);
        // Fallback: return false if invalid value
        return false;
    }

    private getEnvAsArray(varName: string, defaultValue?: string): string[] {
        const strValue = this.getEnv(varName, defaultValue);
        return strValue.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    private async retryOperation<T>(operation: () => Promise<T>): Promise<T> {
        let lastError: Error | undefined = undefined;

        for (
          let attempt = 0;
          attempt <= this.retryConfig.maxRetries;
          attempt++
        ) {
          try {
            return await operation();
          } catch (error) {
            lastError = error as Error;

            if (attempt === this.retryConfig.maxRetries) {
              break;
            }

            const delay = Math.min(
              this.retryConfig.baseDelayMs * Math.pow(2, attempt),
              this.retryConfig.maxDelayMs
            );

            const errorMessage =
              error instanceof Error ? error.message : String(error);
            this.logger.warn(
              `Operation failed (attempt ${
                attempt + 1
              }), retrying in ${delay}ms: ${errorMessage}`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        if (lastError) {
            throw lastError;
        }
        console.error('Unknown error occurred during retry operation');
        throw new Error('Unknown error occurred during retry operation');
    }

    private getCachedValue(key: string): string | null {
        const cached = this.cache.get(key);
        if (cached && cached.expiry > Date.now()) {
            return typeof cached.value === 'string' ? cached.value : null;
        }
        if (cached) {
            this.cache.delete(key); // Clean up expired entry
        }
        return null;
    }

    private setCachedValue(key: string, value: string, ttlMs: number): void {
        this.cache.set(key, {
            value,
            expiry: Date.now() + ttlMs
        });
    }

    healthCheck(): { status: 'healthy' | 'unhealthy'; lastLoaded: Date | null; cacheValid: boolean } {
        try {
          // Check if we have any cached config
          const hasCachedData = this.cache.size > 0;

          // Check if cache entries are valid
          const validCacheEntries = Array.from(this.cache.values()).filter(
            (entry) => entry.expiry > Date.now()
          );
          const cacheValid = validCacheEntries.length > 0;

          return {
            status: cacheValid ? 'healthy' : 'unhealthy',
            lastLoaded: hasCachedData ? new Date() : null, // Simplified - in real implementation track actual load time
            cacheValid,
          };
        } catch (error) {
            return {
                status: 'unhealthy',
                lastLoaded: null,
                cacheValid: false
            };
        }
    }
}
