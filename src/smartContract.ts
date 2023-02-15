import { readFileSync } from "fs";

export const contractByteCode = readFileSync("contractBuild/contract_Hashbuzz_sol_HashbuzzV2.bin");
export const contractAbi = JSON.parse(readFileSync("contractBuild/contract_Hashbuzz_sol_HashbuzzV2.abi", "utf8"));

