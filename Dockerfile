# Build Stage
FROM node:18-alpine AS build

# Specify where our app will live in the container
WORKDIR /app

COPY package*.json ./

# Copy the node App to the container
COPY . /app/

RUN npm install


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
    HEDERA_NETWORK=testnet \
    REPO=hashbuzz/dApp-backend \
    MIRROR_NODE=https://testnet.mirrornode.hedera.com

RUN npx prisma generate
RUN npm run build

# Expose port and start application
EXPOSE 4000
CMD ["npm", "start"]
