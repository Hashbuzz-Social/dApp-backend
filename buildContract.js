const {instantiateContract} = require("./initiateContract");

// const proxyContract = fs.readFileSync("contract/HashbuzzProxy.sol", "utf8");
// const logicalContract = fs.readFileSync("contract/HashbuzzLogicV1.sol", "utf8");

const logicalContract =  instantiateContract("./contract/HashbuzzLogicV1.sol");
console.log(logicalContract);