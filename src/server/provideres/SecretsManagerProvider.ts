import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import { ILogger } from "jet-logger";

export class SecretsManagerProvider {
    private log?: ILogger;
    private secretsManagerClient: SecretsManager;
    private secretKey: string;
    private value?: string;

    constructor(log: ILogger | undefined, secretsManagerClient: SecretsManager, secretKey: string) {
        this.log = log;
        this.secretsManagerClient = secretsManagerClient;
        this.secretKey = secretKey;
    }

    async get(defaultValue?: string): Promise<string> {
        if (this.value) {
            return this.value || '';
        }
        try {
            const secret = await this.secretsManagerClient.getSecretValue({ SecretId: "Prod_Variables" });
            const secretData = JSON.parse(secret.SecretString || '{}');
            this.value = secretData[this.secretKey] || '';
            this.log?.info(`Fetched secret key "${this.secretKey}" successfully.`);
        } catch (error) {
            if (defaultValue === undefined) {
                throw new Error(`Could not retrieve secret key "${this.secretKey}": ${error}`);
            }
            this.log?.info(`Falling back to default value for secret key "${this.secretKey}".`);
            this.value = defaultValue;
        }
        return this.value || '';
    }
}
