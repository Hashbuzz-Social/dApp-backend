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
  ReceiptStatusError,
} from '@hashgraph/sdk';
import { network } from '@prisma/client';
import createPrismaClient from '@shared/prisma';
import { Interface, ethers } from 'ethers';
import logger from 'src/config/logger';
import { eventList } from '../contractsV201';
import intiHederaService, { HederaClientConfig } from './hedera-service';
import MailerService from './mailer/mailerService';

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

  private async initializeContract() {
    const contract = await this.provideActiveContract();
    if (contract?.contract_id) {
      this.contract_id = contract.contract_id;
    } else {
      logger.err('Failed to initialize contract: Invalid contract ID');
    }
  }

  async deploy(bytecode: string): Promise<ContractId | null> {
    try {
      const hederaService = await intiHederaService();
      if (!(await this.isClientBalanceSufficient(hederaService))) {
        throw new Error(
          'Insufficient balance for transaction. Please top up your account.'
        );
      }

      const createContract = new ContractCreateFlow()
        .setGas(5_000_000)
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
      logger.info(' - The new contract ID is ' + contractId);
      return contractId;
    } catch (error) {
      logger.err('Error deploying contract:' + error);
      return null;
    }
  }

  private async provideActiveContract() {
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

      logger.info('No active contract found in records, Getting from env');
      const contract_id_new = appConfig.network.contractAddress;
      if (contract_id_new) {
        const contractData = await prisma.smartcontracts.create({
          data: {
            contractAddress:
              AccountId.fromString(contract_id_new).toSolidityAddress(),
            contract_id: `${contract_id_new}`,
            logicalContract_id: `${contract_id_new}`,
            lcFileID: contract_id_new ?? '',
            network: appConfig.network.network,
            is_active: true,
            fileId: contract_id_new ?? '',
            created_at: new Date().toISOString(),
          },
        });
        return {
          contract_id: contractData.contract_id,
          contractAddress: contractData.contractAddress,
          logicalContract_id: contractData.logicalContract_id,
        };
      }
      return null;
    } catch (error) {
      logger.err('Error in provideActiveContract:' + error);
      return null;
    }
  }

  async callContractReadOnly(fnName: string, args: ContractFunctionParameters) {
    try {
      if (!this.contract_id) throw new Error('Contract ID not found');
      const hederaService = await intiHederaService();
      if (!(await this.isClientBalanceSufficient(hederaService))) {
        throw new Error(
          'Insufficient balance for transaction. Please top up your account.'
        );
      }

      const query = new ContractCallQuery()
        .setContractId(this.contract_id)
        .setGas(30_000)
        .setFunction(fnName, args);

      const response = await query.execute(hederaService.hederaClient);
      const resultAsBytes = response.asBytes();

      // Decode result or error
      const errorMessage = this.decodeErrorMessage(response);
      if (errorMessage) {
        logger.err(`Contract reverted: ${errorMessage}`);
        return { error: true, errorMessage };
      }

      const dataDecoded = this.decodeReturnData(fnName, response);
      const data = { resultAsBytes, dataDecoded };
      logger.info(
        ` - The Contract query result for **${fnName}** :: => ${JSON.stringify(
          data
        )}`
      );
      return data;
    } catch (error) {
      if (error instanceof ReceiptStatusError) {
        logger.err('ReceiptStatusError:' + error.message);
      } else {
        logger.err('Unexpected error:' + error.message);
      }
      throw error;
    }
  }

  async callContractWithStateChange(
    functionName: string,
    args: ContractFunctionParameters,
    memo = 'Hashbuzz contract transaction'
  ) {
    if (!this.contract_id) throw new Error('Contract ID not found');
    const hederaService = await intiHederaService();
    if (!(await this.isClientBalanceSufficient(hederaService))) {
      throw new Error(
        'Insufficient balance for transaction. Please top up your account.'
      );
    }

    const transaction = new ContractExecuteTransaction()
      .setContractId(this.contract_id)
      .setGas(100_000)
      .setFunction(functionName, args)
      .setTransactionMemo(memo);

    try {
      const response = await transaction.execute(hederaService.hederaClient);
      const receipt = await response.getReceipt(hederaService.hederaClient);
      const record = await response.getRecord(hederaService.hederaClient);
      const result = record.contractFunctionResult;

      // Check for contract revert status in receipt
      if (receipt.status.toString() === 'CONTRACT_REVERT_EXECUTED') {
        const errorMessage = result
          ? this.decodeErrorMessage(result)
          : 'Contract execution reverted';
        logger.err(
          `Contract reverted with status ${receipt.status.toString()}: ${
            errorMessage || 'Contract execution reverted'
          }`
        );
        return {
          status: receipt.status,
          error: true,
          errorMessage: errorMessage || 'Contract execution reverted',
          transactionId: record.transactionId.toString(),
          receipt,
        };
      }

      if (result) {
        // Try to decode error if reverted
        const errorMessage = this.decodeErrorMessage(result);
        if (errorMessage) {
          logger.err(`Smart contract reverted: ${errorMessage}`);
          return {
            status: receipt.status,
            error: true,
            errorMessage,
            transactionId: record.transactionId.toString(),
            receipt,
          };
        }

        const resultAsBytes = result.asBytes();
        const dataDecoded = this.decodeReturnData(functionName, result);
        return {
          status: receipt.status,
          success: true,
          receipt,
          resultAsBytes,
          dataDecoded,
          transactionId: record.transactionId.toString(),
        };
      }

      return {
        status: receipt.status,
        success: true,
        transactionId: record.transactionId.toString(),
        receipt,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (error instanceof ReceiptStatusError) {
        logger.err(`ReceiptStatusError: ${errorMessage}`);

        // Extract transaction ID if available
        let transactionId = 'unknown';
        try {
          const match = errorMessage.match(/transaction (\S+)/);
          if (match) {
            transactionId = match[1];
          }
        } catch (e) {
          // Ignore parsing errors
        }

        return {
          error: true,
          errorMessage: `Contract execution failed: ${errorMessage}`,
          transactionId,
          status: 'CONTRACT_REVERT_EXECUTED',
        };
      } else {
        logger.err(`Unexpected contract error: ${errorMessage}`);
        return {
          error: true,
          errorMessage: `Unexpected error during contract execution: ${errorMessage}`,
          transactionId: 'unknown',
          status: 'ERROR',
        };
      }
    }
  }

  private decodeReturnData(methodName: string, result: ContractFunctionResult) {
    const method = this.abi.getFunction(methodName);
    if (!method) {
      logger.err('Method not found in ABI');
      return null;
    }
    try {
      return this.abi.decodeFunctionResult(method, result.asBytes());
    } catch (err) {
      logger.err(`Failed to decode return data for ${methodName}:` + err);
      return null;
    }
  }

  private decodeErrorMessage(result: ContractFunctionResult): string | null {
    try {
      const bytes = Buffer.from(result.asBytes());
      const hex = '0x' + bytes.toString('hex');
      const errorSelector = '0x08c379a0'; // Error(string)

      // Standard revert reason
      if (hex.startsWith(errorSelector)) {
        const data = '0x' + hex.slice(errorSelector.length);
        const iface = new ethers.Interface(['function Error(string)']);
        const decoded = iface.decodeFunctionData('Error', data);
        return typeof decoded[0] === 'string' ? decoded[0] : String(decoded[0]);
      }

      // Try decoding as custom error (from ABI)
      try {
        return this.abi.parseError(hex)?.name ?? null;
      } catch {
        return null;
      }
    } catch (e) {
      logger.err('Failed to decode error message:' + e);
      return null;
    }
  }

  private captureEventLogs(methodName: string, result: ContractFunctionResult) {
    const events = eventList[methodName];
    if (!events) return [];

    return result.logs.map((log) => {
      const logStringHex = '0x' + Buffer.from(log.data).toString('hex');
      const logTopics = log.topics.map(
        (topic) => '0x' + Buffer.from(topic).toString('hex')
      );
      return this.decodeEvent(events[0], logStringHex, logTopics.slice(1));
    });
  }

  decodeEvent(eventName: string, log: string, topics: any[]) {
    const event = this.abi.getEvent(eventName);
    return event ? this.abi.decodeEventLog(event, log, topics) : [];
  }

  private async isClientBalanceSufficient(
    hederaService: HederaClientConfig
  ): Promise<boolean> {
    const balance = await new AccountBalanceQuery()
      .setAccountId(hederaService.operatorId)
      .execute(hederaService.hederaClient);

    const gasCost = 5 * 100_000_000; // 5 hbar in tinybars
    const currentBalance = balance.hbars.toTinybars();
    const isSufficient = currentBalance >= gasCost;

    if (!isSufficient) {
      logger.err(
        'Insufficient balance for transaction. Please top up your account.'
      );
      const mailer = await MailerService.create();
      await mailer.sendLowBalanceAlert(
        currentBalance / 100_000_000,
        hederaService.operatorId.toString()
      );
    }
    return isSufficient;
  }
}

export default HederaContract;
