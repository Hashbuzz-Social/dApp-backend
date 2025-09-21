import { ILogger } from 'jet-logger';

export class EnvValueProvider {
    private log?: ILogger;
    private variableName: string;

    constructor(log: ILogger | undefined, variableName: string) {
        this.log = log;
        this.variableName = variableName;
    }

    get(defaultValue?: string): string {
        const value = process.env[this.variableName];
        if (value !== undefined) {
            // Removed excessive environment variable success logging to reduce spam
            return value;
        }
        if (defaultValue !== undefined) {
          // this.log?.info(`Using default value for environment variable "${this.variableName}".`);
          return defaultValue;
        }
        this.log?.err(`Environment variable "${this.variableName}" is not set. Returning empty string.`);
        return '';
    }

    getAsNumber(defaultValue?: number): number {
        const value = this.get(defaultValue?.toString());
        const numberValue = Number(value);
        if (isNaN(numberValue)) {
            this.log?.err(`Environment variable "${this.variableName}" is not a valid number. Returning default value or NaN.`);
            return defaultValue ?? NaN;
        }
        return numberValue;
    }

    getAsBoolean(defaultValue?: boolean): boolean {
        const value = this.get(defaultValue !== undefined ? defaultValue.toString() : undefined);
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        this.log?.err(`Environment variable "${this.variableName}" is not a valid boolean. Returning default value or false.`);
        return defaultValue ?? false;
    }
}
