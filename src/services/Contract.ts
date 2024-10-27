import {
    ContractCallQuery,
    ContractCreateFlow,
    ContractExecuteTransaction,
    ContractFunctionParameters,
    ContractFunctionResult,
    ContractId
} from "@hashgraph/sdk";
import prisma from "@shared/prisma";
import { Contract, ContractInterface, ethers } from "ethers";
import hederaService from "./hedera-service";

class HederaContract {
    private contract_id: string | undefined;
    private contract: Contract | undefined;

    constructor(abi: ethers.Interface | ethers.InterfaceAbi) {
        this.initializeContract(abi);
    }

    private async initializeContract(abi: ethers.Interface | ethers.InterfaceAbi) {
        const contract = await this.provideActiveContract();
        if (contract) {
            this.contract_id = contract.contract_id;
            this.contract = new ethers.Contract(this.contract_id, abi);
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
        if (!this.contract_id) {
            throw new Error("Contract ID not found");
        }
        const query = new ContractCallQuery()
            .setContractId(this.contract_id)
            .setGas(30000) // Set an appropriate gas limit
            .setFunction(fnName, args);

        const response = await query.execute(hederaService.hederaClient);
        const resultAsBytes = response.asBytes();

        const dataDecoded = this.decodeReturnData(fnName, response);
        const eventLogs = this.captureEventLogs(response);
        return { resultAsBytes, dataDecoded, eventLogs };
    }

    async callContractWithStateChange(functionName: string, args: ContractFunctionParameters) {
        if (!this.contract_id) {
            throw new Error("Contract ID not found");
        }

        const transaction = new ContractExecuteTransaction()
            .setContractId(this.contract_id)
            .setGas(100000) // Set appropriate gas limit for state change
            .setFunction(functionName, args);

        const response = await transaction.execute(hederaService.hederaClient);
        const receipt = await response.getReceipt(hederaService.hederaClient);
        const record = await response.getRecord(hederaService.hederaClient);
        const result = record.contractFunctionResult;

        if (result) {
            const resultAsBytes = result.asBytes();
            const dataDecoded = this.decodeReturnData(functionName, result);
            const eventLogs = this.captureEventLogs(result);
            return { status: receipt.status, resultAsBytes, dataDecoded, eventLogs };
        }

        return { status: receipt.status };
    }

    // Method to decode return data using ethers.js
    private decodeReturnData(methodName: string, result: ContractFunctionResult) {
        if (!this.contract) {
            throw new Error("Contract not found");
        }
        const method = this.contract.interface.getFunction(methodName as string);
        const data = result.asBytes();
        //@ts-ignore
        return this.contract.interface.decodeFunctionResult(method, data);
    }

    // Method to capture event logs using ethers.js
    private captureEventLogs(result: ContractFunctionResult) {
        const logs = result.logs.map(log => {
            try {
                //@ts-ignore
                return this.contract.interface.parseLog(log);
            } catch (e) {
                console.error("Failed to parse log:", e);
                return null;
            }
        });
        return logs.filter(log => log !== null);
    }
}

export default HederaContract;