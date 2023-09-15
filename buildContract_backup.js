const solc = require("solc");
const fs = require("fs");
const path = require("path");

// Read Solidity code from file
const proxyContract = fs.readFileSync("contract/HashbuzzProxy.sol", "utf8");
const logicalContract = fs.readFileSync("contract/HashbuzzLogicV1.sol", "utf8");
// console.log(contractCode);

// Define resolver function for dependencies
function resolver(importPath) {
  if (importPath === "FungibleToken/HederaTokenService.sol") {
    return {
      contents: fs.readFileSync(path.resolve(__dirname, "contract", "FungibleToken", "HederaTokenService.sol"), "utf8"),
    };
  } else if (importPath === "FungibleToken/HederaResponseCodes.sol") {
    return {
      contents: fs.readFileSync(path.resolve(__dirname, "contract", "FungibleToken", "HederaResponseCodes.sol"), "utf8"),
    };
  } else if (importPath === "interface/IHederaTokenService.sol") {
    return {
      contents: fs.readFileSync(path.resolve(__dirname, "contract", "interface", "IHederaTokenService.sol"), "utf8"),
    };
  } else if (importPath === "interface/IRandomNumberGenerate.sol") {
    return {
      contents: fs.readFileSync(path.resolve(__dirname, "contract", "interface", "IRandomNumberGenerate.sol"), "utf8"),
    };
  } else if (importPath === "FungibleToken/ExpiryHelper.sol") {
    return {
      contents: fs.readFileSync(path.resolve(__dirname, "contract", "FungibleToken", "ExpiryHelper.sol"), "utf8"),
    };
  } else if (importPath === "FungibleToken/KeyHelper.sol") {
    return {
      contents: fs.readFileSync(path.resolve(__dirname, "contract", "FungibleToken", "KeyHelper.sol"), "utf8"),
    };
  } else if (importPath === "RandomNumberGenerate.sol") {
    return {
      contents: fs.readFileSync(path.resolve(__dirname, "contract", "RandomNumberGenerate.sol"), "utf8"),
    };
  } else if (importPath === "library/Roles.sol") {
    return {
      contents: fs.readFileSync(path.resolve(__dirname, "contract", "library", "Roles.sol"), "utf8"),
    };
  } else if (importPath === "@openzeppelin/co") {
   
  
  } else {
    return { error: "File not found" };
  }
}
// Define input for solc compiler
const input = {
  language: "Solidity",
  sources: {
    "HashbuzzProxy.sol": {
      content: proxyContract,
    },
    "HashbuzzLogicV1.sol": {
      content: logicalContract,
    },
  },
  settings: {
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode"],
      },
    },
  },
};

// Compile contract using solc
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: resolver }));

console.log(output);

// Extract compiled bytecode and ABI from output
const proxyContractByteCode = output.contracts["HashbuzzProxy.sol"]["HashbuzzProxy"].evm.bytecode.object;
const proxyAbi = output.contracts["HashbuzzProxy.sol"]["HashbuzzProxy"].abi;

const logicalContractByteCode = output.contracts["HashbuzzLogicV1.sol"]["HashbuzzLogicV1"].evm.bytecode.object;
const logicalAbi = output.contracts["HashbuzzLogicV1.sol"]["HashbuzzLogicV1"].abi;

const dirPath = path.join(__dirname, "contractBuild");
if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath);
}

// Write bytecode to file
fs.writeFileSync(path.join(__dirname, "contractBuild", "HashbuzzProxy.bin"), proxyContractByteCode);

// Write ABI to file
fs.writeFileSync(path.join(__dirname, "contractBuild", "HashbuzzProxy.abi"), JSON.stringify(proxyAbi));

// Write bytecode to file
fs.writeFileSync(path.join(__dirname, "contractBuild", "HashbuzzLogicV1.bin"), logicalContractByteCode);

// Write ABI to file
fs.writeFileSync(path.join(__dirname, "contractBuild", "HashbuzzLogicV1.abi"), JSON.stringify(logicalAbi));

console.log("Bytecode and ABI written to files");

