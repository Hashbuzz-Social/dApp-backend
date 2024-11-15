# Use the official Node.js 18 Alpine image as the base image
FROM node:18-alpine as build

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Set environment variables
ENV NODE_ENV="docker"
ENV JET_LOGGER_MODE="FILE"
ENV JET_LOGGER_FILEPATH="jet-logger.log"
ENV JET_LOGGER_TIMESTAMP="TRUE"
ENV JET_LOGGER_FORMAT="LINE"
ENV PORT=4000
ENV HEDERA_NETWORK="mainnet"
ENV REWARD_CALIM_HOUR=48
ENV TWITTER_CALLBACK_HOST="http://apiV-v1.hashbuzz.social"
ENV TWITTER_ADMIN_USERNAMES="Ashh20x omprakashMahua"
ENV SELF_BRAND_HANDLE="hbuzzs"
ENV FRONTEND_URL="http://hashbuzz.social/dashboard"
ENV HASHBUZZ_CONTRACT_ADDRESS="0.0.4323686"

# Expose the port the app runs on
EXPOSE 4000

# Command to run the application
CMD ["node", "env-config.js"]
