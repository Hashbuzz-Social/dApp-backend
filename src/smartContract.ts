import { readFileSync } from "fs";

export const contractByteCode = readFileSync("contractBuild/Hashbuzz.bin");
export const contractAbi = JSON.parse(readFileSync("contractBuild/Hashbuzz.abi", "utf8"));

export const proxyContractByteCode = readFileSync("contractBuild/HashbuzzProxy.bin");
export const proxyContractAbi = JSON.parse(readFileSync("contractBuild/HashbuzzProxy.abi", "utf8"));

export const logicalContractByteCode = readFileSync("contractBuild/HashbuzzLogicV1.bin");
export const logicalContractAbi = JSON.parse(readFileSync("contractBuild/HashbuzzLogicV1.abi", "utf8"));

