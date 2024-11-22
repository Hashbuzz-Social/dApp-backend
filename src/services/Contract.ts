import {
    ContractCallQuery,
    ContractCreateFlow,
    ContractExecuteTransaction,
    ContractFunctionParameters,
    ContractFunctionResult,
    ContractId,
    ReceiptStatusError
} from "@hashgraph/sdk";
import prisma from "@shared/prisma";
import { eventList } from "../contractsV201";
import { Interface, ethers } from "ethers";
import hederaService from "./hedera-service";


class HederaContract {
    public contract_id: string | undefined;
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
        if (contract && contract.contract_id) {
            this.contract_id = contract.contract_id;
        } else {
            console.error("Failed to initialize contract: Invalid contract ID");
        }
    }

    // Deploy method for deploying contracts with bytecode and constructor args
    async deploy(bytecode: string): Promise<ContractId | null> {
        const createContract = new ContractCreateFlow()
            .setGas(5000000)
            .setBytecode(bytecode)
            .setConstructorParameters(
                new ContractFunctionParameters().addAddress(
                    hederaService.operatorId.toSolidityAddress()
                )
            )
            .setAdminKey(hederaService.operatorKey);

        const createSubmit = await createContract.execute(hederaService.hederaClient);
        const createRx = await createSubmit.getReceipt(hederaService.hederaClient);
        const contractId = createRx.contractId;
        console.log(" - The new contract ID is " + contractId);
        return contractId;
    }

    private async provideActiveContract() {
        const availableContracts = await prisma.smartcontracts.findMany({
            where: {
                is_active: true,
                network: hederaService.network,
            },
        });
        if (availableContracts.length > 0) {
            const { contract_id, contractAddress, logicalContract_id } = availableContracts[0];
            return { contract_id, contractAddress, logicalContract_id };
        }
        return null;
    }

    // Contract Call Query Methods
    async callContractReadOnly(fnName: string, args: ContractFunctionParameters) {
        try {
            if (!this.contract_id) {
                throw new Error("Contract ID not found");
            }
            const query = new ContractCallQuery()
                .setContractId(this.contract_id)
                .setGas(30000) // Set an appropriate gas limit
                .setFunction(fnName, args);

            const response = await query.execute(hederaService.hederaClient);
            const resultAsBytes = response.asBytes();

            console.log("Contract_call_logs", response?.logs);

            const dataDecoded = this.decodeReturnData(fnName, response);
            // const eventLogs = this.captureEventLogs(fnName, response);

            const data = { resultAsBytes, dataDecoded };

            console.log(` - The Contract query result for **${fnName}** :: =>`, data);

            return data;
        } catch (error) {
            if (error instanceof ReceiptStatusError) {
                console.error("ReceiptStatusError:", error.message);
                // Handle the specific error
            } else {
                console.error("Unexpected error:", error.message);
            }
            throw error;
        }
    }

    async callContractWithStateChange(functionName: string, args: ContractFunctionParameters, memo = "Hashbuzz contract transaction") {
        if (!this.contract_id) {
            throw new Error("Contract ID not found");
        }

        const transaction = new ContractExecuteTransaction()
            .setContractId(this.contract_id)
            .setGas(100000) // Set appropriate gas limit for state change
            .setFunction(functionName, args)
            .setTransactionMemo(memo);

        try {
            const response = await transaction.execute(hederaService.hederaClient);
            const receipt = await response.getReceipt(hederaService.hederaClient);
            const record = await response.getRecord(hederaService.hederaClient);
            const result = record.contractFunctionResult;

            console.log("Contract_call_logs", result?.logs);
            console.log("Contract_call_result", result);

            if (result) {
                const resultAsBytes = result.asBytes();
                const dataDecoded = this.decodeReturnData(functionName, result);
                // const eventLogs = this.captureEventLogs(functionName, result);
                const data = { status: receipt.status, receipt, resultAsBytes, dataDecoded, transactionId: record.transactionId.toString() };
                console.log(` - The Contract transaction status and data for **${functionName}** :: =>`, data);
                return data;
            }
            console.log(` - The Contract transaction receipt and status for **${functionName}** :: =>`, { receipt, status: receipt.status });
            return { status: receipt.status, transactionId: record.transactionId.toString(), receipt };
        } catch (error) {
            if (error instanceof ReceiptStatusError) {
                console.error("ReceiptStatusError:", error.message);
                // Handle the specific error
            } else {
                console.error("Unexpected error:", error.message);
            }
            throw error;

        }
    }

    // Method to decode return data using ethers.js
    // Method to decode return data using ethers.js ABI
    private decodeReturnData(methodName: string, result: ContractFunctionResult) {
        const method = this.abi.getFunction(methodName);
        const data = result.asBytes();
        if (!method) {
            console.error("Method not found in ABI");
            return null;
        }
        return this.abi.decodeFunctionResult(method, data);
    }

    // Method to capture event logs using ethers.js ABI
    private captureEventLogs(methodName: string, result: ContractFunctionResult) {
        const events = eventList[methodName];

        if (events) {
            const eventResult = result.logs.map((log) => {
                let logStringHex = "0x".concat(Buffer.from(log.data).toString("hex"));

                let logTopics: any = [];
                log.topics.forEach((topic) => {
                    logTopics.push("0x".concat(Buffer.from(topic).toString("hex")));
                });

                const event = this.decodeEvent(events[0], logStringHex, logTopics.slice(1));

                return event;
            });

            console.log(` - The Contract event logs for **${methodName}** :: =>`, eventResult);

            return eventResult;
        }
        return [];
    }

    decodeEvent(eventName: string, log: string, topics: any[]) {
        const event = this.abi.getEvent(eventName);
        if (event) {
            const decodedLog = this.abi.decodeEventLog(event, log, topics);
            return decodedLog;
        }
        return []
    }


}

export default HederaContract;