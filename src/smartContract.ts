import { readFileSync } from "fs";

export const contractByteCode = readFileSync("SmartContract/build/Hashbuzz_sol_HashbuzzV2.bin");
export const contractAbi = JSON.parse(readFileSync("SmartContract/build/Hashbuzz_sol_HashbuzzV2.abi", "utf8"));

