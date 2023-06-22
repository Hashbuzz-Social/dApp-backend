const solc = require("solc");
const fs = require("fs");
const path = require("path");

// Read Solidity code from file
const contractCode = fs.readFileSync("contract/Hashbuzz.sol", "utf8");
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
  } else {
    return { error: "File not found" };
  }
}
// Define input for solc compiler
const input = {
  language: "Solidity",
  sources: {
    "Hashbuzz.sol": {
      content: contractCode,
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

// console.log(output);

// Extract compiled bytecode and ABI from output
const bytecode = output.contracts["Hashbuzz.sol"]["HashbuzzV2"].evm.bytecode.object;
const abi = output.contracts["Hashbuzz.sol"]["HashbuzzV2"].abi;

const dirPath = path.join(__dirname, "contractBuild");
if (!fs.existsSync(dirPath)){
  fs.mkdirSync(dirPath);
}

// Write bytecode to file
fs.writeFileSync(path.join(__dirname, "contractBuild", "Hashbuzz.bin"), bytecode);

// Write ABI to file
fs.writeFileSync(path.join(__dirname, "contractBuild", "Hashbuzz.abi"), JSON.stringify(abi));

console.log("Bytecode and ABI written to files");

