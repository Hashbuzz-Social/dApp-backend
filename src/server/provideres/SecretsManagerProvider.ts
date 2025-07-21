import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import { ILogger } from "jet-logger";

export class SecretsManagerProvider {
    private log?: ILogger;
    private secretsManagerClient: SecretsManager;
    private secretKey: string;
    private value?: string;

    constructor(secretsManagerClient: SecretsManager, secretKey: string, log?: ILogger) {
        // Only assign logger if in development environment
        if (process.env.NODE_ENV === 'development' && log) {
            this.log = log;
        }
        this.secretsManagerClient = secretsManagerClient;
        this.secretKey = secretKey;
    }

    async get(defaultValue?: string): Promise<string> {
        if (this.value) {
            return this.value || '';
        }
        try {
            const secret = await this.secretsManagerClient.getSecretValue({ SecretId: "Prod_Variables_V2" });
            const secretData = JSON.parse(secret.SecretString || '{}');
            this.value = secretData[this.secretKey] || '';
            if (this.log) {
                this.log.info(`Secret "${this.secretKey}" retrieved successfully.`);
            }
        } catch (error) {
            if (this.log) {
                this.log.err(`Error retrieving secret "${this.secretKey}": ${error}`);
            }
            if (defaultValue === undefined) {
                throw new Error(`Could not retrieve secret key "${this.secretKey}": ${error}`);
            }
            this.value = defaultValue;
        }
        return this.value || '';
    }
}
