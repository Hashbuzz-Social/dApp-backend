# Set the base image to node:1-6alpine
FROM node:16-alpine as build

# Specify where our app will live in the container
WORKDIR /app

COPY package*.json ./

# Copy the node App to the container
COPY . /app/

# Prepare the container for building node app
RUN npm install

ENV NODE_ENV = "docker"

ENV DATABASE_URL "postgresql://doadmin:AVNS_7lAo0sEh5qUFTNCW8Ea@db-postgresql-nyc3-65715-do-user-11423548-0.b.db.ondigitalocean.com:25060/new04102022?schema=public"

## Setup jet-logger ##
ENV JET_LOGGER_MODE "FILE"
ENV JET_LOGGER_FILEPATH "jet-logger.log"
ENV JET_LOGGER_TIMESTAMP "TRUE"
ENV JET_LOGGER_FORMAT "LINE"

#PORT declaration
ENV PORT 4100

# Twitter app key
ENV TWITTER_APP_USER_TOKEN "AAAAAAAAAAAAAAAAAAAAAGAsaAEAAAAA%2B5iOEMRE9r9mQrrhUmmDCjQ1GA0%3Dl5o8X1STsnuc6LOlecUq3lFeKw9xiVOZUWxfipds21HyxvPB4j"

##### Blockchain Parametest ####
ENV HEDERA_NETWORK=testnet
ENV HEDERA_PRIVATE_KEY=6132e8c617d07c9b1ee56e21640e22f2f54ec737e8c38731e8d4c3f758853655
ENV HEDERA_PUBLIC_KEY=322c4012ad31a1ac4fd7683619a09cee35f21a79dca446ebe3a8ab6e22b607c1
ENV HEDERA_ACCOUNT_ID=0.0.2270519

ENV REWARD_CALIM_HOUR=48

# -----------------
# Twitter Keys
# -----------------
ENV TWITTER_API_KEY=EKQ7GpcHelxQrLpv9EWgsAxvd
ENV TWITTER_API_SECRET=AyFnZWztKGCooCFd1rYzynbdTgLNeLlCJY2h6TZCaZQeFjT4kF
ENV TWITTER_CALLBACK_HOST=https://dapp-backend9-ws9ps.ondigitalocean.app

######## Hashbuzz twiiter data #####
ENV HASHBUZZ_ACCESS_TOKEN=1483587498156642312-5MlsI8u0BDY2Z7EALZdNbSGvEPM33t
ENV HASHBUZZ_ACCESS_SECRET=3QWiEsxrP0m5BcuRb5ccxmEhnZYbAYHGU6KsQnZIyccet

ENV J_ACCESS_TOKEN_SECRET=fb8dcbfcce50f2ffb2d873ed44cdb3a9c9013f6a6d780dfd3eae703ad115e222
ENV J_REFRESH_TOKEN_SECRET=86e7a828c1a879d6d938211a1ed1e18fada5f2bc776fab0314e5e4a7de7462d8

ENV FRONTEND_URL="https://starfish-app-k9l9v.ondigitalocean.app"

# Build NPM project.
RUN npx prisma db pull
RUN npx prisma generate
RUN npm run build

EXPOSE 4100

CMD ["npm", "start"]
