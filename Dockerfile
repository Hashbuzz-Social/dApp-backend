# =============================================================================
# HASHBUZZ DAPP BACKEND - OPTIMIZED DOCKERFILE (Fixed)
# =============================================================================
# Multi-stage build for production deployment - Based on working version

# =============================================================================
# Build Stage 
# =============================================================================
FROM node:20-alpine AS build

# Install required system dependencies for native builds
RUN apk add --no-cache python3 make g++ openssl && \
    rm -rf /var/cache/apk/* /tmp/*

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json to install dependencies first
COPY package*.json ./
COPY prisma/ ./prisma/

# Install dependencies
RUN npm install

# Ensure jsonwebtoken is available in production (it's in devDependencies)
RUN npm install --save jsonwebtoken

# Copy the rest of the application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Ensure jsonwebtoken is available for production
RUN npm install --save jsonwebtoken

# Clean cache but keep node_modules
RUN npm cache clean --force

# =============================================================================
# Production Stage - Use the build stage directly
# =============================================================================
FROM build AS production

# Install only runtime essentials
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs \
    && adduser -S hashbuzz -u 1001 -G nodejs

# Create necessary directories and set permissions
RUN mkdir -p logs uploads \
    && chown -R hashbuzz:nodejs /app

# Set production environment variables (matching your working version)
ENV NODE_ENV=production \
    JET_LOGGER_MODE=FILE \
    JET_LOGGER_FILEPATH=logs/jet-logger.log \
    JET_LOGGER_FILEPATH_DATETIME=FALSE \
    JET_LOGGER_TIMESTAMP=TRUE \
    JET_LOGGER_FORMAT=LINE \
    PORT=4000 \
    REWARD_CALIM_DURATION=60 \
    CAMPAIGN_DURATION=60 \
    TWITTER_CALLBACK_HOST=https://api.hashbuzz.social \
    FRONTEND_URL=https://hashbuzz.social,https://www.hashbuzz.social \
    HEDERA_NETWORK=mainnet \
    REPO=hashbuzz/dApp-backend \
    MIRROR_NODE=https://mainnet-public.mirrornode.hedera.com \
    BUCKET_NAME=campaign-media \
    BUCKET_ENDPOINT=https://sfo3.digitaloceanspaces.com \
    BUCKET_REGION=sfo3 \
    EMAIL_USER=0112.taskbar@gmail.com \
    ALERT_RECEIVER=notifications@hashbuzz.social,hello@omprakash.dev,omkolkata33@gmail.com

# Switch to non-root user
USER hashbuzz

# Expose port
EXPOSE 4000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:4000/health || exit 1

# Use dumb-init for proper signal handling and start with npm start (like your working version)
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
