import { getConfig } from '@appConfig';
import {
  AccountBalanceQuery,
  AccountId,
  ContractCallQuery,
  ContractCreateFlow,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractFunctionResult,
  ContractId,
  TransactionId,
  TransactionRecordQuery,
} from '@hashgraph/sdk';
import { network, PrismaClient } from '@prisma/client';
import createPrismaClient from '@shared/prisma';
import { Interface, ethers } from 'ethers';
import logger from 'src/config/logger';
import { eventList } from '../contractsV201';
import intiHederaService, { HederaClientConfig } from './hedera-service';
import MailerService from './mailer/mailerService';

// Constants
const GAS_LIMITS = {
  DEPLOY: 5_000_000,
  READ: 30_000,
  WRITE: 100_000,
} as const;

const MIN_BALANCE_HBAR = 5;
const HBAR_TO_TINYBAR = 100_000_000;
const ERROR_SELECTOR = '0x08c379a0'; // Error(string) selector

// Types
interface ContractData {
  contract_id: string;
  contractAddress: string;
  logicalContract_id: string;
}

interface TransactionResult {
  success?: boolean;
  error?: boolean;
  status: string;
  transactionId: string;
  result?: any;
  errorMessage?: string;
}

interface QueryResult {
  resultAsBytes: Uint8Array;
  dataDecoded: any;
  error?: boolean;
  errorMessage?: string;
}

class HederaContract {
  public contract_id?: string;
  private abi: Interface;

  constructor(abi: ethers.InterfaceAbi, contract_id?: string) {
    this.abi = new Interface(abi);
    if (contract_id) {
      this.contract_id = contract_id;
    } else {
      this.initializeContract();
    }
  }

  /**
   * Initialize contract from database or environment
   */
  private async initializeContract(): Promise<void> {
    try {
      const contract = await this.provideActiveContract();
      if (contract?.contract_id) {
        this.contract_id = contract.contract_id;
      } else {
        logger.err('Failed to initialize contract: Invalid contract ID');
      }
    } catch (error) {
      logger.err('Error initializing contract: ' + this.getErrorMessage(error));
    }
  }

  /**
   * Deploy a new contract to Hedera network
   */
  async deploy(bytecode: string): Promise<ContractId | null> {
    try {
      const hederaService = await intiHederaService();
      await this.ensureSufficientBalance(hederaService);

      const createContract = new ContractCreateFlow()
        .setGas(GAS_LIMITS.DEPLOY)
        .setBytecode(bytecode)
        .setConstructorParameters(
          new ContractFunctionParameters().addAddress(
            hederaService.operatorId.toSolidityAddress()
          )
        )
        .setAdminKey(hederaService.operatorKey);

      const createSubmit = await createContract.execute(
        hederaService.hederaClient
      );
      const createRx = await createSubmit.getReceipt(
        hederaService.hederaClient
      );
      const contractId = createRx.contractId;

      logger.info(
        `Contract deployed successfully with ID: ${
          contractId?.toString() || 'unknown'
        }`
      );
      return contractId;
    } catch (error) {
      logger.err('Error deploying contract: ' + this.getErrorMessage(error));
      throw error;
    }
  }

  /**
   * Get active contract from database or create new entry
   */
  private async provideActiveContract(): Promise<ContractData | null> {
    try {
      const appConfig = await getConfig();
      const prisma = await createPrismaClient();

      const availableContracts = await prisma.smartcontracts.findMany({
        where: {
          is_active: true,
          network: appConfig.network.network ?? network.testnet,
        },
      });

      if (availableContracts.length > 0) {
        const { contract_id, contractAddress, logicalContract_id } =
          availableContracts[0];
        return { contract_id, contractAddress, logicalContract_id };
      }

      logger.info('No active contract found, retrieving from environment');
      return await this.createContractFromEnv(appConfig, prisma);
    } catch (error) {
      logger.err(
        'Error in provideActiveContract: ' + this.getErrorMessage(error)
      );
      return null;
    }
  }

  /**
   * Create contract entry from environment configuration
   */
  private async createContractFromEnv(
    appConfig: any,
    prisma: PrismaClient
  ): Promise<ContractData | null> {
    const contract_id_new = appConfig.network.contractAddress;
    if (!contract_id_new) {
      logger.err('No contract address found in environment configuration');
      return null;
    }

    const contractData = await prisma.smartcontracts.create({
      data: {
        contractAddress: AccountId.fromString(
          String(contract_id_new)
        ).toSolidityAddress(),
        contract_id: contract_id_new,
        logicalContract_id: contract_id_new,
        lcFileID: contract_id_new,
        network: appConfig.network.network,
        is_active: true,
        fileId: contract_id_new,
        created_at: new Date().toISOString(),
      },
    });

    return {
      contract_id: contractData.contract_id,
      contractAddress: contractData.contractAddress,
      logicalContract_id: contractData.logicalContract_id,
    };
  }

  /**
   * Call contract read-only function (query)
   */
  async callContractReadOnly(
    fnName: string,
    args: ContractFunctionParameters
  ): Promise<QueryResult> {
    try {
      if (!this.contract_id) {
        throw new Error('Contract ID not initialized');
      }

      const hederaService = await intiHederaService();
      await this.ensureSufficientBalance(hederaService);

      const query = new ContractCallQuery()
        .setContractId(this.contract_id)
        .setGas(GAS_LIMITS.READ)
        .setFunction(fnName, args);

      const response = await query.execute(hederaService.hederaClient);

      // Check for contract revert
      const errorMessage = this.decodeErrorMessage(response);
      if (errorMessage) {
        logger.err(`Contract query reverted: ${errorMessage}`);
        return {
          resultAsBytes: response.asBytes(),
          dataDecoded: null,
          error: true,
          errorMessage,
        };
      }

      const resultAsBytes = response.asBytes();
      const dataDecoded = this.decodeReturnData(fnName, response);

      logger.info(`Contract query [${fnName}] executed successfully`);
      return { resultAsBytes, dataDecoded };
    } catch (error) {
      const errorMsg = this.getErrorMessage(error);
      logger.err(`Contract query [${fnName}] failed: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Call contract function that modifies state
   */
  async callContractWithStateChange(
    functionName: string,
    args: ContractFunctionParameters,
    memo = 'Hashbuzz contract transaction'
  ): Promise<TransactionResult> {
    if (!this.contract_id) {
      throw new Error('Contract ID not initialized');
    }

    const hederaService = await intiHederaService();
    await this.ensureSufficientBalance(hederaService);

    const client = hederaService.hederaClient;
    const tx = new ContractExecuteTransaction()
      .setContractId(this.contract_id)
      .setGas(GAS_LIMITS.WRITE)
      .setFunction(functionName, args)
      .setTransactionMemo(memo);

    let txId: TransactionId | null = null;

    try {
      const response = await tx.execute(client);
      txId = response.transactionId;
      const receipt = await response.getReceipt(client);
      const record = await response.getRecord(client);

      const result = record.contractFunctionResult;
      const decoded = result
        ? this.decodeReturnData(functionName, result)
        : null;

      logger.info(
        `Transaction [${functionName}] succeeded: ${txId.toString()}`
      );
      return {
        success: true,
        status: receipt.status.toString(),
        transactionId: txId.toString(),
        result: decoded,
      };
    } catch (error: unknown) {
      logger.warn(
        `Transaction [${functionName}] error: ${this.getErrorMessage(error)}`
      );

      // Extract transaction ID from error if available
      txId = (error as any)?.transactionId || txId;

      if (!txId) {
        logger.warn('No transaction ID available in error');
        return {
          error: true,
          status: 'ERROR',
          transactionId: 'unknown',
          errorMessage: this.getErrorMessage(error) || 'Unknown SDK error',
        };
      }

      logger.info(`Handling transaction error for ID: ${txId.toString()}`);

      // Fetch transaction record to get detailed error information
      return await this.handleTransactionError(txId, functionName, client);
    }
  }

  /**
   * Handle transaction errors by fetching record and decoding revert reason
   */
  private async handleTransactionError(
    txId: TransactionId,
    functionName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any
  ): Promise<TransactionResult> {
    try {
      logger.info(`Fetching transaction record for ID: ${txId.toString()}`);

      // Attempt to fetch record - may throw on CONTRACT_REVERT_EXECUTED
      let record;
      try {
        record = await new TransactionRecordQuery()
          .setTransactionId(txId)
          .setIncludeChildren(true)
          .setIncludeDuplicates(true)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          .execute(client);
      } catch (recordError: unknown) {
        // If the record query itself fails due to CONTRACT_REVERT_EXECUTED,
        // extract what we can from the error
        logger.warn(
          `Record query threw error: ${this.getErrorMessage(recordError)}`
        );

        // Try to extract transaction record from the error object itself
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errorObj = recordError as any;
        if (errorObj.transactionRecord) {
          record = errorObj.transactionRecord;
          logger.info(`Extracted transaction record from error object`);
        } else {
          // If we can't get the record, return basic error info
          return {
            error: true,
            status: 'CONTRACT_REVERT_EXECUTED',
            transactionId: txId.toString(),
            errorMessage:
              this.getErrorMessage(recordError) ||
              'Contract execution reverted',
          };
        }
      }

      logger.info(`Transaction record fetched for ID: ${txId.toString()}`);
      const result = record.contractFunctionResult;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const status = String(record.receipt.status.toString());
      logger.info(`Receipt status for ${txId.toString()}: ${status}`);

      // Try multiple methods to extract error message
      let errorMessage = 'Contract execution reverted';

      if (result) {
        logger.info(
          `ContractFunctionResult present for ${txId.toString()}, attempting to extract error information`
        );

        // Method 1: Check result.errorMessage
        const rawError = result.errorMessage;
        logger.info(
          `Raw errorMessage from result for ${txId.toString()}: ${String(
            rawError
          )}`
        );
        if (rawError) {
          const decoded = this.decodeRevertReason(String(rawError));
          logger.info(
            `Decoded revert reason from rawError for ${txId.toString()}: ${String(
              decoded
            )}`
          );
          errorMessage = decoded || String(rawError);
        }

        // Method 2: Try decoding from bytes
        if (!rawError || errorMessage === String(rawError)) {
          logger.info(
            `Attempting to decode error message from bytes for ${txId.toString()}`
          );
          const decodedFromBytes = this.decodeErrorMessage(
            result as ContractFunctionResult
          );
          logger.info(
            `Decoded from bytes for ${txId.toString()}: ${String(
              decodedFromBytes
            )}`
          );
          if (decodedFromBytes) {
            errorMessage = decodedFromBytes;
          }
        }
      } else {
        logger.info(
          `No ContractFunctionResult available in record for ${txId.toString()}`
        );
      }

      logger.err(
        `Transaction [${functionName}] reverted: ${errorMessage} (Status: ${status})`
      );

      return {
        error: true,
        status,
        transactionId: txId.toString(),
        errorMessage,
      };
    } catch (recordErr) {
      logger.err(
        `
         ${txId.toString()}: ${this.getErrorMessage(recordErr)}`
      );
      return {
        error: true,
        status: 'ERROR',
        transactionId: txId.toString(),
        errorMessage:
          this.getErrorMessage(recordErr) ||
          'Failed to fetch transaction record',
      };
    }
  }

  /**
   * Decode function return data using ABI
   */
  private decodeReturnData(
    methodName: string,
    result: ContractFunctionResult
  ): any {
    try {
      const method = this.abi.getFunction(methodName);
      if (!method) {
        logger.err(`Method ${methodName} not found in ABI`);
        return null;
      }
      return this.abi.decodeFunctionResult(method, result.asBytes());
    } catch (err) {
      logger.err(
        `Failed to decode return data for ${methodName}: ${this.getErrorMessage(
          err
        )}`
      );
      return null;
    }
  }

  /**
   * Decode error message from contract function result
   */
  private decodeErrorMessage(result: ContractFunctionResult): string | null {
    try {
      const bytes = Buffer.from(result.asBytes());
      const hex = '0x' + bytes.toString('hex');

      // Try standard Error(string) selector
      if (hex.startsWith(ERROR_SELECTOR)) {
        const decoded = this.decodeRevertReason(hex);
        if (decoded) return decoded;
      }

      // Try custom error from ABI
      try {
        const parsedError = this.abi.parseError(hex);
        if (parsedError) {
          return parsedError.name;
        }
      } catch {
        // Not a recognized custom error
      }

      return null;
    } catch (e) {
      logger.err('Failed to decode error message: ' + this.getErrorMessage(e));
      return null;
    }
  }

  /**
   * Decode standard Solidity revert reason: Error(string)
   */
  private decodeRevertReason(rawError: string): string | null {
    try {
      const data = rawError.startsWith('0x') ? rawError : `0x${rawError}`;

      // Check if it's a standard Error(string) revert
      if (!data.startsWith(ERROR_SELECTOR)) {
        return null;
      }

      const iface = new Interface(['function Error(string)']);
      const decoded = iface.decodeFunctionData('Error', data);
      const reason = decoded?.[0];

      return typeof reason === 'string' ? reason : String(reason);
    } catch (err) {
      logger.err(
        'Failed to decode revert reason: ' + this.getErrorMessage(err)
      );
      return null;
    }
  }

  /**
   * Capture and decode event logs from transaction
   */
  private captureEventLogs(
    methodName: string,
    result: ContractFunctionResult
  ): unknown[] {
    const events = eventList[methodName];
    if (!events) return [];

    return result.logs.map((log) => {
      const logStringHex = '0x' + Buffer.from(log.data).toString('hex');
      const logTopics: string[] = log.topics.map(
        (topic) => '0x' + Buffer.from(topic).toString('hex')
      );
      return this.decodeEvent(events[0], logStringHex, logTopics.slice(1));
    });
  }

  /**
   * Decode event using ABI
   */
  private decodeEvent(
    eventName: string,
    log: string,
    topics: string[]
  ): unknown {
    try {
      const event = this.abi.getEvent(eventName);
      return event ? this.abi.decodeEventLog(event, log, topics) : null;
    } catch (err) {
      logger.err(
        `Failed to decode event ${eventName}: ${this.getErrorMessage(err)}`
      );
      return null;
    }
  }

  /**
   * Check if account has sufficient balance and send alert if low
   */
  private async ensureSufficientBalance(
    hederaService: HederaClientConfig
  ): Promise<void> {
    const balance = await new AccountBalanceQuery()
      .setAccountId(hederaService.operatorId)
      .execute(hederaService.hederaClient);

    const gasCost = MIN_BALANCE_HBAR * HBAR_TO_TINYBAR;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    const tinybarsValue = balance.hbars.toTinybars() as any;
    const currentBalance =
      typeof tinybarsValue === 'object' && 'toNumber' in tinybarsValue
        ? // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          (tinybarsValue.toNumber() as number)
        : Number(tinybarsValue);
    const isSufficient = currentBalance >= gasCost;

    if (!isSufficient) {
      const balanceInHbar = currentBalance / HBAR_TO_TINYBAR;
      logger.err(
        `Insufficient balance: ${balanceInHbar} HBAR (minimum required: ${MIN_BALANCE_HBAR} HBAR)`
      );

      // Send low balance alert email
      try {
        const mailer = await MailerService.create();
        await mailer.sendLowBalanceAlert(
          balanceInHbar,
          hederaService.operatorId.toString()
        );
      } catch (err) {
        logger.err(
          'Failed to send low balance alert: ' + this.getErrorMessage(err)
        );
      }

      throw new Error(
        `Insufficient balance for transaction. Current: ${balanceInHbar} HBAR, Required: ${MIN_BALANCE_HBAR} HBAR`
      );
    }
  }

  /**
   * Extract error message from unknown error type
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

export default HederaContract;
