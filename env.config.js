const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const { exec } = require("child_process");

const region = "us-east-1";
const secretName = "X_Tokens";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Create a Secrets Manager client
const client = new SecretsManagerClient({
  region: region,
});

async function fetchSecrets() {
  try {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: secretName,
      })
    );

    const secret = JSON.parse(response.SecretString);

    // Add all secret values to process.env
    for (const envKey of Object.keys(secret)) {
      process.env[envKey] = secret[envKey];
    }
  } catch (error) {
    console.error("Error fetching secrets:", error);
    throw error;
  }
}

async function runNpmCommand(fullCommand) {
  return new Promise((resolve, reject) => {
    exec(fullCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing npm command: ${error.message}`);
        reject(error);
        return;
      }

      console.log(`npm command output:\n${stdout}`);
      if (stderr) {
        console.error(`npm command error output:\n${stderr}`);
      }

      resolve();
    });
  });
}

(async () => {
  try {
    await fetchSecrets();

    console.log("Executing npm command 1");
    await runNpmCommand(`npm run db:push`);

    await delay(500); // Adjust delay as needed

    console.log("Executing npm command 2");
    await runNpmCommand(`npm run build`);

    await delay(500); // Adjust delay as needed

    console.log("Executing npm command 3");
    await runNpmCommand(`npm run start`);
  } catch (error) {
    console.error("Error in main script:", error);
  }
})();
