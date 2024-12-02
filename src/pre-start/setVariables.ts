import { AccountId } from "@hashgraph/sdk";
import fs from "fs";
import path from "path";
import { getConfig } from "src/appConfig";

const trailsetterAccountsDataPath = path.join(__dirname, "../.trailsetters/data.json");
const trailsetterDataDir = path.dirname(trailsetterAccountsDataPath);

if (!fs.existsSync(trailsetterDataDir)) {
  fs.mkdirSync(trailsetterDataDir, { recursive: true });
  console.log(`Created directory: ${trailsetterDataDir}`);
}

declare global {
  var adminAddress: string[];
  var TrailsetterAccounts: string[];
  var db: {
    redis: string;
  }
}

const getAccountAddress = (add: string) => AccountId.fromString(add).toSolidityAddress().toString();

const setVariables = async () => {
  console.log("Starting to set variables...");

  try {
    const configs = await getConfig();

    globalThis.adminAddress = String(configs.app.adminAddresses)
      .split(",")
      .map((add: string) => getAccountAddress(add));

    process.env['DATABASE_URL'] = configs.db.dbServerURI;
    console.log("Database URL set:", process.env['DATABASE_URL']);

    globalThis.db = {
      redis: configs.db.redisServerURI
    };

    if (fs.existsSync(trailsetterAccountsDataPath)) {
      const data = fs.readFileSync(trailsetterAccountsDataPath, "utf-8");
      globalThis.TrailsetterAccounts = JSON.parse(data);
      console.log("Trailsetter accounts loaded:", globalThis.TrailsetterAccounts);
    } else {
      console.log(`Trailsetter accounts data file not found at: ${trailsetterAccountsDataPath}`);
    }

    console.log("Variables set successfully.");
  } catch (error) {
    console.error("Error setting variables:", error);
  }
};

export default setVariables;