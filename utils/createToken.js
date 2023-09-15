// Note: This is a hypothetical example and doesn't cover all details
// such as error handling, keys management, etc.

// Step 1: Setting up the Hedera JavaScript SDK.
const { Client, TokenCreateTransaction, Hbar, AccountId, PrivateKey, TokenMintTransaction } = require("@hashgraph/sdk");
const dotenv = require("dotenv");
const fs = require("fs");
dotenv.config();

// Step 2: Establishing an account.
// Replace these with your actual account ID and private key.
const accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
const accountPrivateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);

// Initialize client
const client = Client.forTestnet().setOperator(accountId, accountPrivateKey);

async function createToken() {
  try {
    // Step 3: Creating a token.
    // Define token parameters such as name, symbol, decimals, initial supply, etc.
    const supplyKey = PrivateKey.generateECDSA();
    const wipeKey = supplyKey.publicKey;

    const transactionId = new TokenCreateTransaction()
      .setTokenName("HbzToken2")
      .setTokenSymbol("HBZ21")
      .setDecimals(8)
      .setInitialSupply(100000000)
      .setTreasuryAccountId(accountId)
      .setAdminKey(accountPrivateKey)
      .setSupplyKey(supplyKey)
      .setWipeKey(wipeKey)
      .setMaxTransactionFee(new Hbar(30)) // Change this as per your requirements.
      .freezeWith(client);

    // Sign transaction with your private key
    const signTx = await transactionId.sign(accountPrivateKey);

    // Submit the transaction to a Hedera network
    const txResponse = await signTx.execute(client);

    // Request the receipt of the transaction
    const receipt = await txResponse.getReceipt(client);

    // Obtain the token ID from the receipt
    const newTokenId = receipt.tokenId;

    console.log("The new token ID is " + newTokenId);
    fs.appendFile(
      "tokens.txt",
      newTokenId.toString() + "\n" + "supplyKey key = " + supplyKey + "\n wipeKey key = " + wipeKey + "\n =================== \n",
      (err) => {
        if (err) throw err;
        console.log("Token ID saved!");
      }
    );
  } catch (error) {
    console.error("Error creating token", error);
  }
}

async function mintToken(tokenId, amountToMint = 10000) {
  try {
    // Replace with your actual token ID

    // Define the amount to mint
    // amountToMint = 1000;

    const supplyKey = PrivateKey.fromString("3030020100300706052b8104000a04220420294307d12bb91883cc13d12e6b372739ff4341ced8a896209bfe04f4c1bc8104");

    // Mint additional tokens
    const transactionId = new TokenMintTransaction()
      .setTokenId(tokenId)
      .setAmount(amountToMint * 1e8)
      .freezeWith(client);

    // Sign transaction with your private key
    const signTx = await transactionId.sign(supplyKey);

    // Submit the transaction to a Hedera network
    const txResponse = await signTx.execute(client);

    // Request the receipt of the transaction
    const receipt = await txResponse.getReceipt(client);

    console.log("Successfully minted " + amountToMint + " tokens.");
    return receipt;
  } catch (error) {
    console.error("Error minting tokens", error);
  }
}

// createToken();
mintToken("0.0.350115", 15000);

