import { AccountId } from "@hashgraph/sdk";
import fs from "fs";
import path from "path";


const trailsetterAccoutsDataPath = path.join(__dirname, "../../.trailsetters/data.json");
const trailsetterDaaDir = path.dirname(trailsetterAccoutsDataPath);

if (!fs.existsSync(trailsetterDaaDir)) {
  fs.mkdirSync(trailsetterDaaDir, { recursive: true });
}

declare global {
  var adminAddress: string[];
  var TrailsetterAccounts: string[];
}

const getAccountAddress = (add: string) => AccountId.fromString(add).toSolidityAddress().toString();

const setVariables = () => {
  globalThis.adminAddress = String(process.env.ADMIN_ADDRESS)
    .split(",")
    .map((add: string) => getAccountAddress(add));

  if (fs.existsSync(trailsetterAccoutsDataPath)) {
    const data = fs.readFileSync(trailsetterAccoutsDataPath, "utf-8");
    globalThis.TrailsetterAccounts = JSON.parse(data);
  }
};


export default setVariables;