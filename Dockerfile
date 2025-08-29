# =============================================================================
# HASHBUZZ DAPP BACKEND - ENHANCED DOCKERFILE
# =============================================================================
# Multi-stage build for optimized production deployment
# Features: Security hardening, dependency optimization, health checks

# =============================================================================
# Stage 1: Dependencies - Install and cache dependencies
# =============================================================================
FROM node:22-alpine AS dependencies

# Add metadata labels
LABEL maintainer="Hashbuzz Team"
LABEL version="2.0"
LABEL description="Hashbuzz dApp Backend API Server"

# Install system dependencies for native builds
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    openssl \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Create app directory with proper permissions
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY prisma/schema.prisma ./prisma/

# Install dependencies with npm ci for faster, reliable builds
RUN npm ci --only=production --no-audit --no-fund \
    && npm cache clean --force

# =============================================================================
# Stage 2: Build - Generate Prisma client and build application
# =============================================================================
FROM node:22-alpine AS build

# Install build dependencies
RUN apk add --no-cache python3 make g++ openssl

WORKDIR /app

# Copy package files and install all dependencies (including dev)
COPY package*.json ./
COPY prisma/ ./prisma/
RUN npm ci --no-audit --no-fund

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Remove development dependencies
RUN npm prune --production

# =============================================================================
# Stage 3: Production - Create optimized production image
# =============================================================================
FROM node:22-alpine AS production

# Add metadata
LABEL stage="production"

# Install runtime dependencies and security updates
RUN apk add --no-cache \
    dumb-init \
    openssl \
    && apk upgrade \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs \
    && adduser -S hashbuzz -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Create necessary directories with proper permissions
RUN mkdir -p logs uploads public \
    && chown -R hashbuzz:nodejs /app

# Copy built application from build stage
COPY --from=build --chown=hashbuzz:nodejs /app/dist ./dist
COPY --from=build --chown=hashbuzz:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=hashbuzz:nodejs /app/package*.json ./
COPY --from=build --chown=hashbuzz:nodejs /app/prisma ./prisma

# Copy static assets
COPY --chown=hashbuzz:nodejs public/ ./public/
COPY --chown=hashbuzz:nodejs scripts/ ./scripts/

# Set production environment variables
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
    CMD node --version && curl -f http://localhost:4000/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]
