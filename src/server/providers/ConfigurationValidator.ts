import Joi from 'joi';
import { AppConfig, Environment, AwsRegion, HederaNetwork, LogLevel } from '../../@types/AppConfig';

export class ConfigurationValidator {
    
    private static readonly configSchema = Joi.object({
        app: Joi.object({
            port: Joi.number().integer().min(1).max(65535).required(),
            adminAddresses: Joi.string().required(),
            openAIKey: Joi.string().min(20).required(),
            defaultRewardClaimDuration: Joi.number().integer().min(1).max(365).required(),
            defaultCampaignDuration: Joi.number().integer().min(1).max(365).required(),
            appURL: Joi.string().uri().required(),
            xCallBackHost: Joi.string().uri().required(),
            whitelistedDomains: Joi.array().items(Joi.string().uri()).min(1).required(),
            mirrorNodeURL: Joi.string().uri().required(),
            environment: Joi.string().valid(...Object.values(Environment)).required()
        }).required(),

        aws: Joi.object({
            region: Joi.string().valid(...Object.values(AwsRegion)).required(),
            secretsManager: Joi.object({
                cacheTtlMs: Joi.number().integer().min(60000).max(86400000).required(),
                maxRetries: Joi.number().integer().min(1).max(10).required(),
                retryDelayMs: Joi.number().integer().min(100).max(10000).required()
            }).required()
        }).required(),

        encryptions: Joi.object({
            jwtSecretForAccessToken: Joi.string().min(32).required(),
            jwtSecretForRefreshToken: Joi.string().min(32).required(),
            encryptionKey: Joi.string().min(32).required(),
            sessionSecret: Joi.string().min(32).required()
        }).required(),

        repo: Joi.object({
            repo: Joi.string().required(),
            repoClientID: Joi.string().required(),
            repoClientSecret: Joi.string().required()
        }).required(),

        db: Joi.object({
            dbServerURI: Joi.string().uri().required(),
            redisServerURI: Joi.string().uri().required(),
            pool: Joi.object({
                min: Joi.number().integer().min(0).required(),
                max: Joi.number().integer().min(1).required(),
                idleTimeoutMs: Joi.number().integer().min(1000).required()
            }).required()
        }).required(),

        xApp: Joi.object({
            xAPIKey: Joi.string().required(),
            xAPISecret: Joi.string().required(),
            xUserToken: Joi.string().required(),
            xHashbuzzAccAccessToken: Joi.string().required(),
            xHashbuzzAccSecretToken: Joi.string().required()
        }).required(),

        network: Joi.object({
            network: Joi.string().valid(...Object.values(HederaNetwork)).required(),
            privateKey: Joi.string().pattern(/^[0-9a-fA-F]{64}$/).required(),
            publicKey: Joi.string().required(),
            contractAddress: Joi.string().required(),
            accountID: Joi.string().pattern(/^0\.0\.\d+$/).required()
        }).required(),

        bucket: Joi.object({
            accessKeyId: Joi.string().required(),
            secretAccessKey: Joi.string().required(),
            region: Joi.string().valid(...Object.values(AwsRegion)).required(),
            bucketName: Joi.string().required(),
            endpoint: Joi.string().uri().allow('').optional()
        }).required(),

        mailer: Joi.object({
            emailUser: Joi.string().email().required(),
            emailPass: Joi.string().required(),
            alertReceivers: Joi.array().items(Joi.string().email()).min(1).required()
        }).required(),

        monitoring: Joi.object({
            metricsEnabled: Joi.boolean().required(),
            healthCheckPath: Joi.string().required(),
            logLevel: Joi.string().valid(...Object.values(LogLevel)).required()
        }).required(),

        cache: Joi.object({
            configCacheTtlMs: Joi.number().integer().min(60000).required(),
            distributedCache: Joi.boolean().required(),
            keyPrefix: Joi.string().required()
        }).required(),

        featureFlags: Joi.object({
            enableNewAuth: Joi.boolean().required(),
            enhancedLogging: Joi.boolean().required(),
            rateLimiting: Joi.boolean().required()
        }).required()
    });

    static validateConfig(config: any): { isValid: boolean; errors: string[]; validatedConfig?: AppConfig } {
        try {
            const { error, value } = this.configSchema.validate(config, {
                abortEarly: false, // Collect all errors
                allowUnknown: false, // Don't allow extra properties
                stripUnknown: true // Remove unknown properties
            });

            if (error) {
                const errors = error.details.map(detail => {
                    const path = detail.path.join('.');
                    return `${path}: ${detail.message}`;
                });

                return {
                    isValid: false,
                    errors
                };
            }

            return {
                isValid: true,
                errors: [],
                validatedConfig: value as AppConfig
            };
        } catch (error) {
            return {
                isValid: false,
                errors: [`Validation error: ${(error as Error).message}`]
            };
        }
    }

    /**
     * Validates a subset of configuration for partial updates
     */
    static validatePartialConfig(config: Partial<AppConfig>): { isValid: boolean; errors: string[] } {
        try {
            const { error } = this.configSchema.validate(config, {
                abortEarly: false,
                allowUnknown: false,
                stripUnknown: true,
                presence: 'optional' // Make all fields optional for partial validation
            });

            if (error) {
                const errors = error.details.map(detail => {
                    const path = detail.path.join('.');
                    return `${path}: ${detail.message}`;
                });

                return {
                    isValid: false,
                    errors
                };
            }

            return {
                isValid: true,
                errors: []
            };
        } catch (error) {
            return {
                isValid: false,
                errors: [`Partial validation error: ${(error as Error).message}`]
            };
        }
    }

    /**
     * Get validation schema for documentation or introspection
     */
    static getSchema(): Joi.ObjectSchema {
        return this.configSchema;
    }

    /**
     * Validate specific configuration section
     */
    static validateSection<K extends keyof AppConfig>(
        sectionName: K, 
        sectionData: any
    ): { isValid: boolean; errors: string[] } {
        try {
            const sectionSchema = this.configSchema.extract(sectionName);
            const { error } = sectionSchema.validate(sectionData, {
                abortEarly: false,
                allowUnknown: false,
                stripUnknown: true
            });

            if (error) {
                const errors = error.details.map(detail => detail.message);
                return {
                    isValid: false,
                    errors
                };
            }

            return {
                isValid: true,
                errors: []
            };
        } catch (error) {
            return {
                isValid: false,
                errors: [`Section validation error: ${(error as Error).message}`]
            };
        }
    }

    /**
     * Legacy method for backward compatibility
     */
    static validate(config: unknown): AppConfig {
        const result = this.validateConfig(config);
        if (!result.isValid) {
            throw new Error(`Configuration validation failed: ${result.errors.join(', ')}`);
        }
        return result.validatedConfig as AppConfig;
    }

    /**
     * Check if configuration conforms to security best practices
     */
    static validateSecurity(config: AppConfig): { isSecure: boolean; warnings: string[] } {
        const warnings: string[] = [];

        // Check secret lengths
        if (config.encryptions.jwtSecretForAccessToken.length < 64) {
            warnings.push('JWT access token secret should be at least 64 characters for enhanced security');
        }

        if (config.encryptions.jwtSecretForRefreshToken.length < 64) {
            warnings.push('JWT refresh token secret should be at least 64 characters for enhanced security');
        }

        // Check for development environment in production
        if (config.app.environment === Environment.PRODUCTION) {
            if (config.app.appURL.includes('localhost') || config.app.appURL.includes('127.0.0.1')) {
                warnings.push('Production environment should not use localhost URLs');
            }

            if (config.monitoring.logLevel === LogLevel.DEBUG) {
                warnings.push('Debug logging should not be enabled in production');
            }
        }

        // Check cache TTL values
        if (config.cache.configCacheTtlMs < 300000) { // 5 minutes
            warnings.push('Configuration cache TTL is very low, consider increasing for better performance');
        }

        return {
            isSecure: warnings.length === 0,
            warnings
        };
    }

    /**
     * Validate environment-specific requirements
     */
    static validateEnvironment(config: AppConfig): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        switch (config.app.environment) {
            case Environment.PRODUCTION:
                // Production-specific validations
                if (config.monitoring.logLevel === LogLevel.DEBUG) {
                    errors.push('Debug logging is not allowed in production environment');
                }
                if (!config.featureFlags.rateLimiting) {
                    errors.push('Rate limiting must be enabled in production environment');
                }
                break;

            case Environment.DEVELOPMENT:
                // Development-specific validations
                if (config.network.network === HederaNetwork.MAINNET) {
                    errors.push('Mainnet should not be used in development environment');
                }
                break;

            case Environment.STAGING:
                // Staging-specific validations
                if (config.network.network === HederaNetwork.MAINNET) {
                    errors.push('Consider using testnet for staging environment');
                }
                break;
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}