const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load existing environment variables from .env file
const envFilePath = path.resolve(__dirname, '.env');
const envConfig = dotenv.parse(fs.readFileSync(envFilePath));

// Function to generate a 32-byte encryption key
const generateEncryptionKey = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Function to update or add a key-value pair in the .env file
const updateEnv = (key, value) => {
    envConfig[key] = value;

    const updatedEnv = Object.keys(envConfig)
        .map(envKey => `${envKey}=${envConfig[envKey]}`)
        .join('\n');

    // Read the original .env file to preserve comments and formatting
    const originalEnvLines = fs.readFileSync(envFilePath, 'utf-8').split('\n');
    const updatedEnvLines = originalEnvLines.map(line => {
        if (line.startsWith('#') || !line.includes('=')) {
            return line;
        }
        const [envKey] = line.split('=');
        if (envConfig[envKey] !== undefined) {
            return `${envKey}=${envConfig[envKey]}`;
        }
        return line;
    });

    // Add any new keys that were not in the original .env file
    Object.keys(envConfig).forEach(envKey => {
        if (!updatedEnvLines.some(line => line.startsWith(`${envKey}=`))) {
            updatedEnvLines.push(`${envKey}=${envConfig[envKey]}`);
        }
    });

    fs.writeFileSync(envFilePath, updatedEnvLines.join('\n'));
    console.log(`Updated ${key} in .env file`);
};

// Generate a new 32-byte encryption key and update the .env file
const newEncryptionKey = generateEncryptionKey();
updateEnv('ENCRYPTION_KEY', newEncryptionKey);