import { AccountId } from "@hashgraph/sdk";
import { getConfig } from "@appConfig";


declare global {
  var adminAddress: string[];
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

    globalThis.db = {
      redis: configs.db.redisServerURI
    };
    console.log("Variables set successfully.");
  } catch (error) {
    console.error("Error setting variables:", error);
  }
};

export default setVariables;