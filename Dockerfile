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

ENV REWARD_CALIM_HOUR=0.5

# -----------------
# Twitter Keys
# -----------------
ENV TWITTER_API_KEY=maDVuEK5U4bRUnC7LAf78aVtm
ENV TWITTER_API_SECRET=OZVJ1KTCzCm7vlN04xxm5ZgshJBfzCQjuyCj0L3nEoUkHy1GDu
ENV TWITTER_CALLBACK_HOST=https://sea-lion-app-dhl7x.ondigitalocean.app

######## Hashbuzz twiiter data #####
ENV HASHBUZZ_ACCESS_TOKEN=1483587498156642312-apgdVxZtDUELIVA6Pneo13GwzECYvP
ENV HASHBUZZ_ACCESS_SECRET=7rF4PnKxObjAYhE1EVddhhs2v7cagg3YRHhbMgx5YEOer


# Build NPM project.
RUN npx prisma db pull
RUN npx prisma generate
RUN npm run build

EXPOSE 4100

CMD ["npm", "start"]