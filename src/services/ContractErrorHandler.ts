import { TransactionId, TransactionRecordQuery } from '@hashgraph/sdk';
import logger from 'src/config/logger';
import intiHederaService from './hedera-service';
import HederaContract from './Contract';

/**
 * Enhanced error details for contract execution failures
 */
export interface ContractErrorDetails {
  transactionId: string;
  errorMessage: string;
  decodedError?: string;
  errorCode?: string;
  hashscanUrl?: string;
  timestamp?: string;
}

/**
 * Decodes a hex-encoded error message from Solidity revert
 * @param hexError - Hex string (with or without 0x prefix)
 * @returns Decoded error message or null
 */
function decodeHexErrorMessage(hexError: string): string | null {
  try {
    // Remove 0x prefix if present
    const cleanHex = hexError.startsWith('0x') ? hexError.slice(2) : hexError;

    // Standard Solidity Error(string) signature: 0x08c379a0
    if (!cleanHex.startsWith('08c379a0')) {
      return null;
    }

    // Skip the function signature (8 chars) and offset (64 chars)
    // The actual string data starts at position 72
    const dataStart = 72;
    if (cleanHex.length < dataStart + 64) {
      return null;
    }

    // Get string length (next 64 chars = 32 bytes)
    const lengthHex = cleanHex.slice(dataStart, dataStart + 64);
    const length = parseInt(lengthHex, 16);

    // Get the actual string data
    const stringStart = dataStart + 64;
    const stringHex = cleanHex.slice(stringStart, stringStart + length * 2);

    // Convert hex to UTF-8 string
    const bytes = [];
    for (let i = 0; i < stringHex.length; i += 2) {
      bytes.push(parseInt(stringHex.slice(i, i + 2), 16));
    }

    const decoded = Buffer.from(bytes).toString('utf8');
    return decoded || null;
  } catch (error) {
    logger.warn(`Failed to decode hex error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Fetches detailed error information from a failed contract transaction
 * Uses both Hedera SDK and Mirror Node API for comprehensive error details
 * @param transactionIdStr - Transaction ID string in format: 0.0.xxxx@seconds.nanos
 * @param contractInstance - Optional HederaContract instance for error decoding
 * @returns Detailed error information
 */
export async function getContractErrorDetails(
  transactionIdStr: string,
  contractInstance?: HederaContract
): Promise<ContractErrorDetails> {
  const details: ContractErrorDetails = {
    transactionId: transactionIdStr,
    errorMessage: 'Contract execution failed',
  };

  try {
    // Generate Hashscan URL
    const network =
      process.env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
    details.hashscanUrl = `https://hashscan.io/${network}/transaction/${transactionIdStr}`;

    // Parse transaction ID to get timestamp for Mirror Node query
    const txId = TransactionId.fromString(transactionIdStr);
    const validStart = txId.validStart;
    const seconds =
      validStart && typeof validStart.seconds !== 'undefined'
        ? String(validStart.seconds)
        : '0';
    const nanos =
      validStart && typeof validStart.nanos !== 'undefined'
        ? String(validStart.nanos).padStart(9, '0')
        : '000000000';
    const timestamp = `${seconds}.${nanos}`;

    // Try Mirror Node API first for more reliable error messages
    try {
      const mirrorNodeUrl =
        network === 'mainnet'
          ? 'https://mainnet-public.mirrornode.hedera.com'
          : 'https://testnet.mirrornode.hedera.com';

      const contractResultUrl = `${mirrorNodeUrl}/api/v1/contracts/results?timestamp=${timestamp}&limit=1`;

      logger.info(
        `Fetching contract result from Mirror Node: ${contractResultUrl}`
      );

      const response = await fetch(contractResultUrl);
      if (response.ok) {
        const data = (await response.json()) as {
          results?: Array<{
            error_message?: string;
            timestamp?: string;
            result?: string;
          }>;
        };

        if (data.results && data.results.length > 0) {
          const result = data.results[0];

          // Store timestamp
          if (result.timestamp) {
            details.timestamp = new Date(
              parseFloat(result.timestamp) * 1000
            ).toISOString();
          }

          // Decode hex error message
          if (result.error_message) {
            const decodedError = decodeHexErrorMessage(result.error_message);
            if (decodedError) {
              details.decodedError = decodedError;
              details.errorMessage = decodedError;

              // Try to extract error code (E001-E017 format)
              const errorCodeMatch = decodedError.match(/E0(0[1-9]|1[0-7])/);
              if (errorCodeMatch) {
                details.errorCode = errorCodeMatch[0];
              }

              logger.info(`Decoded error from Mirror Node: ${decodedError}`);
            } else {
              // If decoding fails, store the raw hex
              logger.warn(
                `Could not decode hex error: ${result.error_message}`
              );
            }
          }
        }
      }
    } catch (mirrorError) {
      logger.warn(
        `Mirror Node API call failed: ${
          mirrorError instanceof Error
            ? mirrorError.message
            : String(mirrorError)
        }`
      );
      // Continue to try SDK method
    }

    // Fallback: Try Hedera SDK if Mirror Node didn't provide error details
    if (!details.decodedError) {
      try {
        const hederaService = await intiHederaService();
        const recordQuery = new TransactionRecordQuery().setTransactionId(txId);
        const record = await recordQuery.execute(hederaService.hederaClient);

        // Store timestamp if not already set
        if (!details.timestamp && record.consensusTimestamp) {
          details.timestamp = record.consensusTimestamp.toDate().toISOString();
        }

        // Try to extract error message from contract function result
        if (record.contractFunctionResult) {
          try {
            // First, try to get the errorMessage directly from Hedera's contractFunctionResult
            const errorMessage = record.contractFunctionResult.errorMessage;

            if (errorMessage) {
              details.decodedError = errorMessage;
              details.errorMessage = errorMessage;

              // Try to extract error code (E001-E017 format)
              const errorCodeMatch = errorMessage.match(/E0(0[1-9]|1[0-7])/);
              if (errorCodeMatch) {
                details.errorCode = errorCodeMatch[0];
              }

              logger.info(
                `Extracted error message from contractFunctionResult: ${errorMessage}`
              );
            } else if (contractInstance) {
              // Fallback: try to decode using the contract instance's ABI
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call
              const decodedError = (contractInstance as any).decodeErrorMessage(
                record.contractFunctionResult
              ) as string | null;

              if (decodedError && typeof decodedError === 'string') {
                details.decodedError = decodedError;
                details.errorMessage = decodedError;

                // Try to extract error code (E001-E017 format)
                const errorCodeMatch = decodedError.match(/E0(0[1-9]|1[0-7])/);
                if (errorCodeMatch) {
                  details.errorCode = errorCodeMatch[0];
                }
              }
            }
          } catch (decodeError) {
            const errMsg =
              decodeError instanceof Error
                ? decodeError.message
                : String(decodeError);
            logger.warn(`Could not decode error message from SDK: ${errMsg}`);
          }
        }
      } catch (sdkError) {
        logger.warn(
          `Hedera SDK query failed: ${
            sdkError instanceof Error ? sdkError.message : String(sdkError)
          }`
        );
      }
    }

    logger.info(
      `Detailed error for transaction ${transactionIdStr}: ${JSON.stringify(
        details
      )}`
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`Could not fetch detailed error for transaction ${transactionIdStr}: ${errorMsg}`);
  }

  return details;
}

/**
 * Formats a contract error for user-friendly display
 * @param errorDetails - Contract error details
 * @returns Formatted error message
 */
export function formatContractError(errorDetails: ContractErrorDetails): string {
  let message = `Transaction failed: ${errorDetails.errorMessage}`;

  if (errorDetails.errorCode) {
    message += ` (Error Code: ${errorDetails.errorCode})`;
  }

  if (errorDetails.hashscanUrl) {
    message += `\n\nView transaction details: ${errorDetails.hashscanUrl}`;
  }

  return message;
}

/**
 * Smart contract error codes mapping
 */
export const SMART_CONTRACT_ERRORS: Record<string, string> = {
  E001: 'Invalid token address',
  E002: 'Invalid campaign address',
  E003: 'Campaigner not allowed',
  E004: 'Campaign not closed',
  E005: 'Token not whitelisted',
  E006: 'Campaign already exists',
  E007: 'Current balance is non-zero',
  E008: 'Insufficient balance',
  E009: 'Non-zero balance',
  E010: 'Invalid expiry time',
  E011: 'Total amount must be greater than zero',
  E012: 'Mismatched input arrays',
  E013: 'Total reward exceeds campaign balance',
  E014: 'Campaign already closed',
  E015: 'Token is not fungible',
  E016: 'Invalid token type',
  E017: 'Campaign expiry time not passed',
};

/**
 * Gets human-readable error message for error code
 * @param errorCode - Error code (e.g., "E001")
 * @returns Human-readable error message
 */
export function getErrorMessage(errorCode: string): string | undefined {
  return SMART_CONTRACT_ERRORS[errorCode];
}

/**
 * Enhanced ContractError class with detailed error information
 */
export class EnhancedContractError extends Error {
  public errorCode?: string;
  public transactionId?: string;
  public hashscanUrl?: string;
  public decodedError?: string;
  public humanReadableMessage?: string;

  constructor(details: Partial<ContractErrorDetails> & { message?: string }) {
    super(details.message || details.errorMessage || 'Contract execution failed');
    this.name = 'EnhancedContractError';
    this.errorCode = details.errorCode;
    this.transactionId = details.transactionId;
    this.hashscanUrl = details.hashscanUrl;
    this.decodedError = details.decodedError;
    this.humanReadableMessage = details.errorCode
      ? SMART_CONTRACT_ERRORS[details.errorCode]
      : undefined;
  }

  /**
   * Gets a formatted error message for display
   */
  public getFormattedMessage(): string {
    let message = this.message;

    if (this.humanReadableMessage) {
      message += ` - ${this.humanReadableMessage}`;
    }

    if (this.errorCode) {
      message += ` (${this.errorCode})`;
    }

    if (this.hashscanUrl) {
      message += `\n\nTransaction: ${this.hashscanUrl}`;
    }

    return message;
  }

  /**
   * Gets a JSON representation of the error
   */
  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      errorCode: this.errorCode,
      transactionId: this.transactionId,
      hashscanUrl: this.hashscanUrl,
      decodedError: this.decodedError,
      humanReadableMessage: this.humanReadableMessage,
      stack: this.stack,
    };
  }
}
