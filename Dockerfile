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

ENV DATABASE_URL "postgresql://postgres:kuKL8sOCjVLM26FnFtvk@hashbuzz-db.ckc8ozbyhf5k.us-east-1.rds.amazonaws.com:5432/db12072023?schema=public"

## Setup jet-logger ##
ENV JET_LOGGER_MODE "FILE"
ENV JET_LOGGER_FILEPATH "jet-logger.log"
ENV JET_LOGGER_TIMESTAMP "TRUE"
ENV JET_LOGGER_FORMAT "LINE"

#PORT declaration
ENV PORT 4000

# Twitter app key
ENV TWITTER_APP_USER_TOKEN "AAAAAAAAAAAAAAAAAAAAAHRwqwEAAAAALogJh1GYCKn2N6n7QDUEos9I814%3Dm41iosDhY9JViAazOnQUNTgz7H3hQ8EwodYTp4qzPLkfUeNdjN"

##### Blockchain Parametest ####
ENV HEDERA_NETWORK=testnet
ENV HEDERA_PRIVATE_KEY=302e020100300506032b657004220420cf49adc9f4b4f4d67f2c5eb06174c64668b73bddc409f18834057c8dacbe07fc
ENV HEDERA_PUBLIC_KEY=302a300506032b657003210090c0d3dbc99ac7c1f6124b535410d7ae4d66f2c5a7f517b6bd1f2d328ac8bd8c
ENV HEDERA_ACCOUNT_ID=0.0.5804415

ENV REWARD_CALIM_HOUR=11

# -----------------
# Twitter Keys
# -----------------
ENV TWITTER_API_KEY=64rfC7J7H5LOoBHuPS1hADFRY
ENV TWITTER_API_SECRET=E92BUwqTvJwT7it8LN6O0cIJOXTqPcikldUkwWBa8RqUrhk8Tf
ENV TWITTER_CALLBACK_HOST=http://apiV-v1.hashbuzz.social
# ENV TWITTER_CALLBACK_HOST="http://localhost:4000"
ENV TWITTER_ADMIN_USERNAMES="Ashh20x omprakashMahua"

######## Hashbuzz twiiter data #####
ENV HASHBUZZ_ACCESS_TOKEN=1483587498156642312-MPExxcmzODjegaG628eL0r2I6XeKeh
ENV HASHBUZZ_ACCESS_SECRET=yRkKgxWc0VoaYKOFmvbHaDie397rW8LjJPZEWQ3PUpx4v
ENV SELF_BRAND_HANDLE=hbuzzs

ENV J_ACCESS_TOKEN_SECRET=fb8dcbfcce50f2ffb2d873ed44cdb3a9c9013f6a6d780dfd3eae703ad115e222
ENV J_REFRESH_TOKEN_SECRET==86e7a828c1a879d6d938211a1ed1e18fada5f2bc776fab0314e5e4a7de7462d8

ENV ENCRYPTION_KEY=5d9280a601d97a3a3fb0f02b79da13cedbed72c1b3482312a7d1abfe84501633

ENV FRONTEND_URL="http://hashbuzz.social/dashboard"
ENV HASHBUZZ_CONTRACT_ADDRESS=0.0.5984115
ENV ADMIN_ADDRESS=0.0.5866123

# Build NPM project.
# RUN npx prisma db pull
RUN npx prisma generate
RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
