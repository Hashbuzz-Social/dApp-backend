import { readFileSync } from "fs";

export const contractByteCode = readFileSync("contractBuild/Hashbuzz.bin");
export const contractAbi = JSON.parse(readFileSync("contractBuild/Hashbuzz.abi", "utf8"));

