import { AccountId } from "@hashgraph/sdk";

declare global {
  var adminAddress: string[];
}
const getAccountAddress = (add: string) => AccountId.fromString(add).toSolidityAddress().toString();

const setVariables = () => {
  globalThis.adminAddress = String(process.env.ADMIN_ADDRESS)
    .split(",")
    .map((add: string) => getAccountAddress(add));
};


export default setVariables;