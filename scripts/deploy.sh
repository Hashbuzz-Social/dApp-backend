#!/bin/bash

# Update package lists
sudo apt-get update

# Navigate to the project directory
cd hashbuzz-dev/dApp-backend

# Pull the latest changes from the staging branch
git pull origin staging

# Check if npm is in PATH and print node and npm versions
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Install npm dependencies
npm install

# Push database changes
npm run db:push

# Build the project
npm run build