import { readFileSync } from "fs";

export const contractByteCode = readFileSync("SmartContract/build/Hashbuzz_sol_Hashbuzz.bin");
export const contractAbi = JSON.parse(readFileSync("SmartContract/build/Hashbuzz_sol_Hashbuzz.abi", "utf8"));
