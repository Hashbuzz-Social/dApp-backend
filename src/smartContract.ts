import { readFileSync } from "fs";

export const contractByteCode = readFileSync("contractBuild/SmartContract_FungibleToken_KeyHelper_sol_Bits.bin");
export const contractAbi = JSON.parse(readFileSync("contractBuild/SmartContract_FungibleToken_KeyHelper_sol_Bits.abi", "utf8"));

