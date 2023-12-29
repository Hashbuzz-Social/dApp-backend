# Set the base image to node:1-6alpine
FROM node:18-alpine as build

# Specify where our app will live in the container
WORKDIR /app

COPY package*.json ./

# Copy the node App to the container
COPY . /app/

# Prepare the container for building node app
RUN npm install

ENV NODE_ENV = "docker"
ENV JET_LOGGER_MODE "FILE"
ENV JET_LOGGER_FILEPATH "jet-logger.log"
ENV JET_LOGGER_TIMESTAMP "TRUE"
ENV JET_LOGGER_FORMAT "LINE"
ENV PORT 4000
ENV HEDERA_NETWORK="mainnet"
ENV REWARD_CALIM_HOUR=48
ENV TWITTER_CALLBACK_HOST=http://apiV-v1.hashbuzz.social
ENV TWITTER_ADMIN_USERNAMES="Ashh20x omprakashMahua"
ENV SELF_BRAND_HANDLE="hbuzzs"
ENV FRONTEND_URL="http://hashbuzz.social/dashboard"
ENV HASHBUZZ_CONTRACT_ADDRESS=0.0.4323686

# RUN npm run build

EXPOSE 4000

CMD ["node","env-config.js"]
