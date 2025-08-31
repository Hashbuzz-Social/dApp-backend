import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import { ILogger } from 'jet-logger';
import { EnvValueProvider } from './EnvValueProvider';
import { FixedValueProvider } from './FixedValueProvider';
import { SecretsManagerProvider } from './SecretsManagerProvider';

export class ConfigurationFactory<TConfiguration> {
    private factoryConfig: ConfigurationFactoryConfig<TConfiguration>;
    private provider: ConfigurationProvider<TConfiguration>;

    constructor(factoryConfig: ConfigurationFactoryConfig<TConfiguration>) {
        this.factoryConfig = factoryConfig;
        this.provider = factoryConfig.builder({
            env: (variableName, defaultValue) => {
                const provider = new EnvValueProvider(this.factoryConfig.log, variableName);
                return async () => provider.get(defaultValue);
            },
            envAsNumber: (variableName, defaultValue) => {
                const provider = new EnvValueProvider(this.factoryConfig.log, variableName);
                return async () => provider.getAsNumber(defaultValue);
            },
            envAsBoolean: (variableName, defaultValue) => {
                const provider = new EnvValueProvider(this.factoryConfig.log, variableName);
                return async () => provider.getAsBoolean(defaultValue);
            },
            fixed: (value) => {
                const provider = new FixedValueProvider(value);
                return async () => provider.get();
            },
            secret: (secretName, defaultValue) => {
                const provider = new SecretsManagerProvider(this.factoryConfig.log, factoryConfig.secretsManagerClient, secretName);
                return async () => provider.get(defaultValue);
            },
        });
    }

    get(): ConfigurationProvider<TConfiguration> {
        return this.provider;
    }

    async getConfiguration(): Promise<TConfiguration> {
        const apply = async <T>(obj: ConfigurationProvider<T>): Promise<T> => {
            const result = {} as T;
            for (const key of Object.keys(obj) as Array<keyof T>) {
                if (typeof obj[key] === 'function') {
                    result[key] = await (obj[key] as () => Promise<T[typeof key]>)();
                } else {
                    result[key] = await apply(obj[key] as ConfigurationProvider<T[typeof key]>);
                }
            }
            return result;
        };
        return apply<TConfiguration>(this.provider);
    }
}

export interface ConfigurationFactoryConfig<TConfiguration> {
    builder: (provider: ConfigurationValueProviderFactories) => ConfigurationProvider<TConfiguration>;
    secretsManagerClient: SecretsManager;
    log?: ILogger;
}

export type ConfigurationProvider<TConfiguration> = {
    [TKey in keyof TConfiguration]: TConfiguration[TKey] extends string | number | boolean
    ? ConfigurationValueProvider<TConfiguration[TKey]>
    : ConfigurationProvider<TConfiguration[TKey]>;
};

type ConfigurationValueProvider<T extends string | number | boolean = string> = () => Promise<T>;

interface ConfigurationValueProviderFactories {
    env: (variableName: string, defaultValue?: string) => ConfigurationValueProvider<string>;
    envAsNumber: (variableName: string, defaultValue?: number) => ConfigurationValueProvider<number>;
    envAsBoolean: (variableName: string, defaultValue?: boolean) => ConfigurationValueProvider<boolean>;
    fixed: <T extends string | number | boolean = string>(value: T) => ConfigurationValueProvider<T>;
    secret: (secretName: string, defaultValue?: string) => ConfigurationValueProvider<string>;
}
