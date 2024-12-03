// src/keyManager.ts
import { generateKeyPairSync } from "crypto";
import { v4 as uuidv4 } from "uuid";
import cron from "node-cron";
import RedisClient from "@services/redis-servie";

// Interface for Key Pair
interface KeyPair {
    kid: string;
    privateKey: string;
    publicKey: string;
    createdAt: number; // Timestamp
}

// Initialize Redis client
const redisClient = new RedisClient();
redisClient.checkConnection().catch(console.error);

// Function to save key store array to Redis
const saveKeyStoreToRedis = async (keyStore: KeyPair[]) => {
    await redisClient.create("authKeyStore", JSON.stringify(keyStore));
};

// Function to load key store array from Redis
const loadKeyStoreFromRedis = async (): Promise<KeyPair[]> => {
    const keyStoreData = await redisClient.read("authKeyStore");
    return keyStoreData ? JSON.parse(keyStoreData) : [];
};

// Function to generate a new RSA key pair
const generateKeyPair = async (): Promise<KeyPair> => {
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

    const keyStore = await loadKeyStoreFromRedis();
    keyStore.push(keyPair);
    await saveKeyStoreToRedis(keyStore);
    return keyPair;
};

// Function to get the current key pair (latest)
export const getCurrentKeyPair = async (): Promise<KeyPair | null> => {
    const keyStore = await loadKeyStoreFromRedis();
    const currentKey = keyStore[keyStore.length - 1];
    if (!currentKey) {
        console.warn("No key pair found! Rotating keys...");
        await rotateKeys();
        return await getCurrentKeyPair();
    }
    return currentKey;
};

// Function to get public key by kid
export const getPublicKey = async (kid: string): Promise<string | undefined> => {
    const keyStore = await loadKeyStoreFromRedis();
    const key = keyStore.find((k) => k.kid === kid);
    return key?.publicKey;
};

// Function to rotate keys every 24 hours
const rotateKeys = async () => {
    console.log("Rotating keys...");
    await generateKeyPair();
    const now = Date.now();
    const keyStore = await loadKeyStoreFromRedis();
    const updatedKeyStore = keyStore.filter((key) => now - key.createdAt < 48 * 60 * 60 * 1000); // 48 hours
    await saveKeyStoreToRedis(updatedKeyStore);
};

// Schedule key rotation every day at midnight
cron.schedule("0 0 * * *", async () => {
    await rotateKeys();
});

// Initialize by generating a key pair if none exist
(async () => {
    const keyStore = await loadKeyStoreFromRedis();
    if (keyStore.length === 0) {
        await generateKeyPair();
    }
})();
