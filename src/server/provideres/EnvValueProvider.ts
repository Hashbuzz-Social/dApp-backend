import { ILogger } from 'jet-logger';

export class EnvValueProvider {
    private log?: ILogger;
    private variableName: string;
    private isProduction: boolean;

    constructor(log: ILogger | undefined, variableName: string) {
        this.log = log;
        this.variableName = variableName;
        this.isProduction = process.env.NODE_ENV === 'production';
    }

    private logError(message: string) {
        if (!this.isProduction) {
            this.log?.err(message);
        }
    }

    get(defaultValue?: string): string {
        const value = process.env[this.variableName];
        if (value !== undefined) {
            return value;
        }
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        this.logError(`Environment variable "${this.variableName}" is not set. Returning empty string.`);
        return '';
    }

    getAsNumber(defaultValue?: number): number {
        const value = this.get(defaultValue?.toString());
        const numberValue = Number(value);
        if (isNaN(numberValue)) {
            this.logError(`Environment variable "${this.variableName}" is not a valid number. Returning default value or NaN.`);
            return defaultValue ?? NaN;
        }
        return numberValue;
    }

    getAsBoolean(defaultValue?: boolean): boolean {
        const value = this.get(defaultValue !== undefined ? defaultValue.toString() : undefined);
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        this.logError(`Environment variable "${this.variableName}" is not a valid boolean. Returning default value or false.`);
        return defaultValue ?? false;
    }
}
