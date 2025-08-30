# =============================================================================
# HASHBUZZ DAPP BACKEND - SIZE-OPTIMIZED DOCKERFILE
# =============================================================================
# Ultra-lightweight multi-stage build for production deployment
# Target: <200MB final image size

# =============================================================================
# Stage 1: Base Dependencies
# =============================================================================
FROM node:22-alpine AS base

# Install only essential system dependencies
RUN apk add --no-cache \
    dumb-init \
    && rm -rf /var/cache/apk/* /tmp/*

WORKDIR /app

# =============================================================================
# Stage 2: Build Dependencies and Application
# =============================================================================
FROM node:22-alpine AS build

# Install build dependencies in a single layer
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    openssl \
    && rm -rf /var/cache/apk/* /tmp/*

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY prisma/ ./prisma/

# Install ALL dependencies (including dev) for building
RUN npm ci --no-audit --no-fund \
    && npm cache clean --force

# Copy source code
COPY . .

# Generate Prisma client and build application
RUN npx prisma generate \
    && npm run build \
    && npm prune --omit=dev --omit=optional \
    && npm cache clean --force \
    && rm -rf /root/.npm

# Remove unnecessary files after build
RUN rm -rf \
    src/ \
    scripts/ \
    docs/ \
    *.md \
    .git* \
    .env.example \
    .prettierrc \
    .editorconfig \
    tsconfig*.json \
    build.ts

# =============================================================================
# Stage 3: Production Runtime (Ultra-minimal)
# =============================================================================
FROM node:22-alpine AS production

# Add metadata
LABEL maintainer="Hashbuzz Team" \
      version="2.0" \
      description="Hashbuzz dApp Backend API Server - Optimized"

# Install only runtime essentials
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs \
    && adduser -S hashbuzz -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Create necessary directories
RUN mkdir -p logs uploads \
    && chown -R hashbuzz:nodejs /app

# Copy only production files from build stage
COPY --from=build --chown=hashbuzz:nodejs /app/dist ./dist
COPY --from=build --chown=hashbuzz:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=hashbuzz:nodejs /app/package.json ./package.json
COPY --from=build --chown=hashbuzz:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma

# Copy minimal runtime assets
COPY --from=build --chown=hashbuzz:nodejs /app/public ./public

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
    CMD curl -f http://localhost:4000/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]
