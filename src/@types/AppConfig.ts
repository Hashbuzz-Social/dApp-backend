export interface AppConfig {
  app: {
    /** App port number */
    port: number;
    /** Hedera network wallet ID which will be the app default admin */
    adminAddresses: string;
    /** OpenAI API key */
    openAIKey: string;
    /** Default app config for reward claim duration in days */
    defaultRewardClaimDuration: number;
    /** Default app config for campaign duration in days */
    defaultCampaignDuration: number;
    /** App frontend URL */
    appURL: string;
    /** App backend callback URL */
    xCallBackHost: string;
    /** Whitelisted domains for CORS */
    whitelistedDomains: string[];
    /** Mirror node URL for Hedera */
    mirrorNodeURL: string;
    /** Environment: development, staging, production */
    environment: Environment;
  };

  aws: {
    /** AWS region */
    region: AwsRegion;
    /** Secrets Manager configuration */
    secretsManager: {
      cacheTtlMs: number;
      maxRetries: number;
      retryDelayMs: number;
    };
  };

  encryptions: {
    /** JWT secret for access token */
    jwtSecretForAccessToken: string;
    /** JWT secret for refresh token */
    jwtSecretForRefreshToken: string;
    /** Database storage encryption key */
    encryptionKey: string;
    /** Session secret for key rotation */
    sessionSecret: string;
    /** Access token expiration time (e.g., '2m', '15m', '24h') */
    accessTokenExpiresIn: string;
    /** Refresh token expiration time (e.g., '7d', '30d') */
    refreshTokenExpiresIn: string;
  };

  repo: {
    /** Git repository */
    repo: string;
    /** Git repository client ID */
    repoClientID: string;
    /** Git repository client secret */
    repoClientSecret: string;
  };

  db: {
    /** PostgreSQL database URI */
    dbServerURI: string;
    /** Redis server URI */
    redisServerURI: string;
    /** Connection pool settings */
    pool: {
      min: number;
      max: number;
      idleTimeoutMs: number;
    };
  };

  xApp: {
    /** Twitter API key */
    xAPIKey: string;
    /** Twitter API secret */
    xAPISecret: string;
    /** Twitter app user token */
    xUserToken: string;
    /** Hashbuzz account access token */
    xHashbuzzAccAccessToken: string;
    /** Hashbuzz account secret token */
    xHashbuzzAccSecretToken: string;
  };

  network: {
    /** Network type: testnet or mainnet */
    network: HederaNetwork;
    /** Private key for the network */
    privateKey: string;
    /** Public key for the network */
    publicKey: string;
    /** Contract address on the network */
    contractAddress: string;
    /** Account id */
    accountID: string;
  };
  bucket: {
    /** AWS access key ID */
    accessKeyId: string;
    /** AWS secret access key */
    secretAccessKey: string;
    /** AWS region */
    region: AwsRegion;
    /** AWS S3 bucket name */
    bucketName: string;
    /** AWS S3 bucket endpoint */
    endpoint: string;
  };
  mailer: {
    /** Email user for sending alerts */
    emailUser: string;
    /** Email password for sending alerts */
    emailPass: string;
    /** Email addresses to receive alerts */
    alertReceivers: string[];
  };

  monitoring: {
    /** Enable metrics collection */
    metricsEnabled: boolean;
    /** Health check endpoint path */
    healthCheckPath: string;
    /** Log level */
    logLevel: LogLevel;
  };

  cache: {
    /** Configuration cache TTL in milliseconds */
    configCacheTtlMs: number;
    /** Enable distributed caching */
    distributedCache: boolean;
    /** Cache key prefix */
    keyPrefix: string;
  };

  featureFlags: {
    /** Enable new authentication flow */
    enableNewAuth: boolean;
    /** Enable enhanced logging */
    enhancedLogging: boolean;
    /** Enable rate limiting */
    rateLimiting: boolean;
  };
}

// Enums for type safety
export enum Environment {
    DEVELOPMENT = 'development',
    STAGING = 'staging',
    PRODUCTION = 'production'
}

export enum AwsRegion {
    US_EAST_1 = 'us-east-1',
    US_WEST_2 = 'us-west-2',
    EU_WEST_1 = 'eu-west-1',
    SFO3 = 'sfo3' // DigitalOcean Spaces region example
}

export enum HederaNetwork {
    TESTNET = 'testnet',
    MAINNET = 'mainnet',
    PREVIEWNET = 'previewnet'
}

export enum LogLevel {
    ERROR = 'error',
    WARN = 'warn',
    INFO = 'info',
    DEBUG = 'debug'
}

export interface CacheEntry {
    value: string;
    expiry: number;
}

export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
}
