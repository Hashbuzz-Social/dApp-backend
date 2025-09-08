#!/bin/bash

# =============================================================================
# HashBuzz Backend - Environment Deployment Script
# =============================================================================
# Deploy to testnet-dev or testnet environments with external dependencies

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    echo "HashBuzz Backend - Environment Deployment"
    echo ""
    echo "Usage: $0 [ENVIRONMENT] [OPTIONS]"
    echo ""
    echo "ENVIRONMENTS:"
    echo "  testnet-dev    Development environment with hot reload"
    echo "  testnet        Release candidate environment"
    echo ""
    echo "OPTIONS:"
    echo "  --build        Force rebuild of Docker images"
    echo "  --logs         Show logs after deployment" 
    echo "  --stop         Stop services instead of starting"
    echo "  --help         Show this help message"
    echo ""
    echo "EXAMPLES:"
    echo "  $0 testnet-dev --build --logs"
    echo "  $0 testnet --stop"
    echo "  $0 testnet-dev"
    echo ""
}

# Parse arguments
ENVIRONMENT=""
BUILD_FLAG=""
LOGS_FLAG=false
STOP_FLAG=false

while [[ $# -gt 0 ]]; do
    case $1 in
        testnet-dev|testnet)
            ENVIRONMENT=$1
            shift
            ;;
        --build)
            BUILD_FLAG="--build"
            shift
            ;;
        --logs)
            LOGS_FLAG=true
            shift
            ;;
        --stop)
            STOP_FLAG=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate environment
if [[ -z "$ENVIRONMENT" ]]; then
    log_error "Environment is required!"
    show_help
    exit 1
fi

# Check if environment file exists
ENV_FILE=".env.$ENVIRONMENT"
if [[ ! -f "$ENV_FILE" ]]; then
    log_error "Environment file $ENV_FILE not found!"
    exit 1
fi

log_info "Using environment: $ENVIRONMENT"
log_info "Environment file: $ENV_FILE"

# Export environment variables
set -a
source "$ENV_FILE"
set +a

# Stop services if requested
if [[ "$STOP_FLAG" == true ]]; then
    log_info "Stopping HashBuzz backend services..."
    docker compose --env-file="$ENV_FILE" down
    log_success "Services stopped"
    exit 0
fi

# Pre-deployment checks
log_info "Running pre-deployment checks..."

# Check Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed or not in PATH"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    log_error "Docker Compose is not installed or not in PATH"
    exit 1
fi

# Check required environment variables
REQUIRED_VARS=(
    "DATABASE_URL"
    "REDIS_URL"
    "HEDERA_NETWORK"
    "HEDERA_ACCOUNT_ID"
    "J_ACCESS_TOKEN_SECRET"
    "ENCRYPTION_KEY"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var}" ]]; then
        log_error "Required environment variable $var is not set"
        exit 1
    fi
done

log_success "Pre-deployment checks passed"

# Create necessary directories
log_info "Creating necessary directories..."
mkdir -p logs uploads

# Set appropriate permissions (skip if not owner)
if [[ $(stat -c %U logs) == $(whoami) ]]; then
    chmod 755 logs
else
    log_warning "Cannot change permissions for logs directory (not owner)"
fi

if [[ $(stat -c %U uploads) == $(whoami) ]]; then
    chmod 755 uploads
else
    log_warning "Cannot change permissions for uploads directory (not owner)"
fi

# Deploy based on environment
case $ENVIRONMENT in
    testnet-dev)
        log_info "Deploying to testnet-dev with development profile..."
        
        # Start with development profile for hot reload
        docker compose --env-file="$ENV_FILE" --profile development up -d $BUILD_FLAG
        
        log_success "testnet-dev environment deployed!"
        log_info "Services available:"
        echo "  - API (Production): http://localhost:${API_PORT:-4000}"
        echo "  - API (Development): http://localhost:${DEV_API_PORT:-4001}"
        echo "  - Debug Port: ${DEV_DEBUG_PORT:-9229}"
        echo "  - Health Check: http://localhost:${API_PORT:-4000}/health"
        ;;
        
    testnet)
        log_info "Deploying to testnet (release candidate)..."
        
        # Start production-like service only
        docker compose --env-file="$ENV_FILE" up -d $BUILD_FLAG hashbuzz-backend
        
        log_success "testnet environment deployed!"
        log_info "Services available:"
        echo "  - API: http://localhost:${API_PORT:-4000}"
        echo "  - Health Check: http://localhost:${API_PORT:-4000}/health"
        ;;
        
    *)
        log_error "Unknown environment: $ENVIRONMENT"
        exit 1
        ;;
esac

# Show container status
log_info "Container status:"
docker compose --env-file="$ENV_FILE" ps

# Test health endpoint
log_info "Testing health endpoint..."
sleep 5
if curl -f "http://localhost:${API_PORT:-4000}/health" &> /dev/null; then
    log_success "Health check passed!"
else
    log_warning "Health check failed - service may still be starting up"
fi

# Show logs if requested
if [[ "$LOGS_FLAG" == true ]]; then
    log_info "Showing logs (Ctrl+C to exit)..."
    docker compose --env-file="$ENV_FILE" logs -f
fi

log_success "Deployment completed successfully!"
echo ""
echo "Useful commands:"
echo "  View logs:    docker compose --env-file=$ENV_FILE logs -f"
echo "  Stop:         docker compose --env-file=$ENV_FILE down"
echo "  Restart:      docker compose --env-file=$ENV_FILE restart"
echo "  Shell access: docker compose --env-file=$ENV_FILE exec hashbuzz-backend sh"
echo ""
