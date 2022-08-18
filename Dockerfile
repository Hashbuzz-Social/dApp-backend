# Set the base image to node:1-6alpine
FROM node:16-alpine as build

# Specify where our app will live in the container
WORKDIR /app

COPY package*.json ./

# Copy the node App to the container
COPY . .

# Prepare the container for building node app
RUN npm install

ENV DATABASE_URL "postgresql://doadmin:AVNS_7lAo0sEh5qUFTNCW8Ea@db-postgresql-nyc3-65715-do-user-11423548-0.b.db.ondigitalocean.com:25060/defaultdb?schema=public"

## Setup jet-logger ##
ENV JET_LOGGER_MODE "FILE"
ENV JET_LOGGER_FILEPATH "jet-logger.log"
ENV JET_LOGGER_TIMESTAMP "TRUE"
ENV JET_LOGGER_FORMAT "LINE"

#PORT declaration
ENV PORT 4100

# Twitter app key
ENV TWITTER_APP_USER_TOKEN "AAAAAAAAAAAAAAAAAAAAAGAsaAEAAAAA%2B5iOEMRE9r9mQrrhUmmDCjQ1GA0%3Dl5o8X1STsnuc6LOlecUq3lFeKw9xiVOZUWxfipds21HyxvPB4j"

# Build NPM project.
RUN npm run build

EXPOSE 4100

CMD ["npm", "start"]