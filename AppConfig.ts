import {SecretsManager}  from "@aws-sdk/client-secrets-manager"
import dotenv from 'dotenv';

dotenv.config();

class Config {
  private static instance: Config;
  private secrets: any = {};

  private constructor() {}

  public static async getInstance(): Promise<Config> {
    if (!Config.instance) {
      Config.instance = new Config();
      await Config.instance.loadSecrets();
    }
    return Config.instance;
  }

  private async loadSecrets() {
    const client = new SecretsManager({
      region: process.env.AWS_REGION, // Ensure this is set in your environment variables
    });

    try {
      const data = await client.getSecretValue({ SecretId: 'your_secret_name' });
      if ('SecretString' in data) {
        this.secrets = JSON.parse(data.SecretString as string);
      } else {
        throw new Error('Secret binary is not supported.');
      }
    } catch (err) {
      console.error('Failed to retrieve secrets:', err);
      throw err;
    }
  }

  public get(key: string): any {
    return this.secrets[key] || process.env[key];
  }
}

export default Config;
