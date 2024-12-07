# Build Stage
FROM node:18-alpine AS build

# Install required system dependencies for native builds
RUN apk add --no-cache python3 make g++ 

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json to install dependencies first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build


# Set environment variables
ENV JET_LOGGER_MODE=FILE \
    JET_LOGGER_FILEPATH=logs/jet-logger.log \
    JET_LOGGER_FILEPATH_DATETIME=FALSE \
    JET_LOGGER_TIMESTAMP=TRUE \
    JET_LOGGER_FORMAT=LINE \
    PORT=4000 \
    REWARD_CALIM_DURATION=60 \
    CAMPAIGN_DURATION=60 \
    TWITTER_CALLBACK_HOST=https://api.hashbuzz.social \
    FRONTEND_URL=https://hashbuzz.social \
    HEDERA_NETWORK=mainnet \
    REPO=hashbuzz/dApp-backend \
    MIRROR_NODE=https://mainnet-public.mirrornode.hedera.com

RUN npx prisma generate
RUN npm run build

# Expose port and start application
EXPOSE 4000
CMD ["npm", "start"]
