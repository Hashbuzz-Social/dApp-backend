// src/keyManager.ts
import fs from "fs";
import path from "path";
import { generateKeyPairSync } from "crypto";
import { v4 as uuidv4 } from "uuid";
import cron from "node-cron";

// Interface for Key Pair
interface KeyPair {
    kid: string;
    privateKey: string;
    publicKey: string;
    createdAt: number; // Timestamp
}

// Path to Key Store
const keyStorePath = path.join(__dirname, "../.keys/keyStore.json");
const keyStoreDir = path.dirname(keyStorePath);

// Ensure the directory exists
if (!fs.existsSync(keyStoreDir)) {
    fs.mkdirSync(keyStoreDir, { recursive: true });
}

// Load existing keys or initialize empty array
let keyStore: KeyPair[] = [];

if (fs.existsSync(keyStorePath)) {
    const data = fs.readFileSync(keyStorePath, "utf-8");
    keyStore = data.length > 0 ? JSON.parse(data) : [];
} else {
    fs.writeFileSync(keyStorePath, JSON.stringify([]), "utf-8");
}

// Function to save key store
const saveKeyStore = () => {
    fs.writeFileSync(keyStorePath, JSON.stringify(keyStore, null, 2), "utf-8");
};

// Function to generate a new RSA key pair
const generateKeyPair = (): KeyPair => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048, // Key size in bits
        publicKeyEncoding: {
            type: "pkcs1",
            format: "pem",
        },
        privateKeyEncoding: {
            type: "pkcs1",
            format: "pem",
        },
    });

    const kid = uuidv4();
    const keyPair: KeyPair = {
        kid,
        privateKey,
        publicKey,
        createdAt: Date.now(),
    };

    keyStore.push(keyPair);
    saveKeyStore();
    console.log(`New key pair generated with kid: ${kid}`);
    return keyPair;
};

// Initialize by generating a key pair if none exist
if (keyStore.length === 0) {
    generateKeyPair();
}

// Function to get the current key pair (latest)
export const getCurrentKeyPair = (): KeyPair => {
    const currentKey = keyStore[keyStore.length - 1];
    if (!currentKey) {
        console.warn("No key pair found! Rotating keys...");
        rotateKeys();
        return getCurrentKeyPair();
    } else {
        return currentKey;
    }
};

// Function to get public key by kid
export const getPublicKey = (kid: string): string | undefined => {
    const key = keyStore.find((k) => k.kid === kid);
    return key?.publicKey;
};

// Function to rotate keys every 24 hours
const rotateKeys = () => {
    console.log("Rotating keys...");
    generateKeyPair();
    // Optionally remove old keys that are expired
    // Assuming JWT tokens are valid for 24 hours, keep keys for 48 hours
    const now = Date.now();
    keyStore = keyStore.filter((key) => now - key.createdAt < 48 * 60 * 60 * 1000); // 48 hours
    saveKeyStore();
};

// Schedule key rotation every day at midnight
cron.schedule("0 0 * * *", () => {
    rotateKeys();
});
