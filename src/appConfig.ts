import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import logger from 'jet-logger';
import { AppConfig } from './@types/AppConfig';
import { EnhancedConfigurationFactory } from './server/providers/EnhancedConfigurationFactory';

// Configuration state management
class ConfigurationManager {
    private static instance: ConfigurationManager;
    private configFactory: EnhancedConfigurationFactory;
    private cachedConfig: AppConfig | null = null;
    private cacheTimestamp: number | null = null;
    private loadingPromise: Promise<AppConfig> | null = null;
    private cacheTtlMs = 3600000; // 1 hour default

    private constructor() {
        const region = process.env.AWS_REGION || 'us-east-1';
        const secretsManager = new SecretsManager({ region });
        
        this.configFactory = new EnhancedConfigurationFactory({
            logger,
            secretsManager,
            retryConfig: {
                maxRetries: parseInt(process.env.CONFIG_MAX_RETRIES || '3'),
                baseDelayMs: parseInt(process.env.CONFIG_RETRY_BASE_DELAY_MS || '1000'),
                maxDelayMs: parseInt(process.env.CONFIG_RETRY_MAX_DELAY_MS || '10000')
            }
        });
    }

    static getInstance(): ConfigurationManager {
        if (!ConfigurationManager.instance) {
            ConfigurationManager.instance = new ConfigurationManager();
        }
        return ConfigurationManager.instance;
    }

    async getConfig(): Promise<AppConfig> {
        // If we're already loading, wait for that promise
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        // Check if cache is still valid
        if (this.cachedConfig && this.isCacheValid()) {
            return this.cachedConfig;
        }

        // Start loading configuration
        this.loadingPromise = this.loadConfiguration();
        
        try {
            const config = await this.loadingPromise;
            this.cachedConfig = config;
            this.cacheTimestamp = Date.now();
            this.cacheTtlMs = config.cache?.configCacheTtlMs || 3600000;
            return config;
        } finally {
            this.loadingPromise = null;
        }
    }

    private async loadConfiguration(): Promise<AppConfig> {
        try {
            logger.info('Loading application configuration...');
            const config = await this.configFactory.getConfiguration();
            logger.info('Configuration loaded successfully');
            return config;
        } catch (error) {
            logger.err('Failed to load configuration: ' + String(error));

            // Fallback to cached config if available
            if (this.cachedConfig) {
                logger.warn('Using stale cached configuration due to loading failure');
                return this.cachedConfig;
            }
            
            throw new Error(`Critical configuration loading failure: ${(error as Error).message}`);
        }
    }

    private isCacheValid(): boolean {
        if (!this.cacheTimestamp) return false;
        return Date.now() - this.cacheTimestamp < this.cacheTtlMs;
    }

    // Force refresh configuration
    async refreshConfig(): Promise<AppConfig> {
        this.cachedConfig = null;
        this.cacheTimestamp = null;
        return this.getConfig();
    }

    // Health check method
    healthCheck(): { status: 'healthy' | 'unhealthy'; lastLoaded: Date | null; cacheValid: boolean } {
        return {
            status: this.cachedConfig ? 'healthy' : 'unhealthy',
            lastLoaded: this.cacheTimestamp ? new Date(this.cacheTimestamp) : null,
            cacheValid: this.isCacheValid()
        };
    }
}

// Export the singleton instance methods
const configManager = ConfigurationManager.getInstance();

export const getConfig = (): Promise<AppConfig> => configManager.getConfig();
export const refreshConfig = (): Promise<AppConfig> => configManager.refreshConfig();
export const getConfigHealth = () => configManager.healthCheck();

// Initialize configuration on module load
getConfig().catch(error => {
    logger.err('Failed to initialize configuration:' + String(error));
    // Don't throw here to prevent module loading failure
});
