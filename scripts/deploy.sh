#!/bin/bash

# Update package lists
sudo apt-get update

# Navigate to the project directory
cd hashbuzz-dev/dApp-backend

# Pull the latest changes from the staging branch
git pull origin staging

# Check if npm is in PATH and print node and npm versions
echo "Node version: $(/root/.nvm/versions/node/v18.18.2/bin/node -v)"
echo "NPM version: $(/root/.nvm/versions/node/v18.18.2/bin/npm -v)"

# Install npm dependencies
/root/.nvm/versions/node/v18.18.2/bin/npm install

# Push database changes
/root/.nvm/versions/node/v18.18.2/bin/npm run db:push

# Build the project
/root/.nvm/versions/node/v18.18.2/bin/npm run build

/root/.nvm/versions/node/v18.18.2/bin/pm2 rstart testnet_dev_backend