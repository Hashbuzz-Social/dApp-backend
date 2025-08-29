#!/bin/bash

# =============================================================================
# HASHBUZZ DAPP BACKEND - DOCKER DEVELOPMENT SCRIPT
# =============================================================================
# Utility script for Docker development workflow

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

# Show usage
show_usage() {
    cat << EOF
🐳 Hashbuzz Docker Development Utility

USAGE:
    $0 [COMMAND] [OPTIONS]

COMMANDS:
    build           Build the Docker image
    dev             Start development environment
    prod            Start production environment
    stop            Stop all services
    restart         Restart services
    logs            Show logs
    shell           Access container shell
    db              Database operations
    test            Run tests in container
    clean           Clean up Docker resources
    health          Check service health
    backup          Create database backup
    help            Show this help message

OPTIONS:
    --build         Force rebuild when starting
    --no-cache      Build without cache
    --detach        Run in background
    --follow        Follow logs in real-time

EXAMPLES:
    $0 build --no-cache
    $0 dev --build
    $0 prod --detach
    $0 logs --follow
    $0 db migrate
    $0 clean --all

EOF
}

# Build Docker image
build_image() {
    print_header "Building Hashbuzz Backend Docker Image"
    
    local build_args=""
    if [[ "$1" == "--no-cache" ]]; then
        build_args="--no-cache"
        print_info "Building without cache..."
    fi
    
    docker build $build_args -t hashbuzz-backend:latest .
    print_info "Build completed successfully!"
}

# Start development environment
start_dev() {
    print_header "Starting Development Environment"
    
    local compose_args=""
    if [[ "$1" == "--build" ]]; then
        compose_args="--build"
        print_info "Building images first..."
    fi
    
    if [[ "$2" == "--detach" ]]; then
        compose_args="$compose_args -d"
    fi
    
    docker compose up $compose_args hashbuzz-backend postgres redis
    print_info "Development environment started!"
}

# Start production environment
start_prod() {
    print_header "Starting Production Environment"
    
    local compose_args=""
    if [[ "$1" == "--build" ]]; then
        compose_args="--build"
    fi
    
    if [[ "$1" == "--detach" || "$2" == "--detach" ]]; then
        compose_args="$compose_args -d"
    fi
    
    docker compose --profile proxy $compose_args up
    print_info "Production environment started!"
}

# Stop services
stop_services() {
    print_header "Stopping Services"
    docker compose down
    print_info "Services stopped!"
}

# Restart services
restart_services() {
    print_header "Restarting Services"
    docker compose restart
    print_info "Services restarted!"
}

# Show logs
show_logs() {
    local follow_flag=""
    if [[ "$1" == "--follow" ]]; then
        follow_flag="-f"
    fi
    
    if [[ -n "$2" ]]; then
        docker compose logs $follow_flag "$2"
    else
        docker compose logs $follow_flag hashbuzz-backend
    fi
}

# Access container shell
access_shell() {
    print_header "Accessing Container Shell"
    docker compose exec hashbuzz-backend sh
}

# Database operations
db_operations() {
    case "$1" in
        "migrate")
            print_info "Running database migrations..."
            docker compose exec hashbuzz-backend npx prisma migrate deploy
            ;;
        "generate")
            print_info "Generating Prisma client..."
            docker compose exec hashbuzz-backend npx prisma generate
            ;;
        "studio")
            print_info "Starting Prisma Studio..."
            docker compose exec hashbuzz-backend npx prisma studio
            ;;
        "reset")
            print_warning "Resetting database..."
            docker compose exec hashbuzz-backend npx prisma migrate reset
            ;;
        "shell")
            print_info "Accessing database shell..."
            docker compose exec postgres psql -U hashbuzz -d hashbuzz
            ;;
        *)
            print_error "Unknown database operation. Available: migrate, generate, studio, reset, shell"
            exit 1
            ;;
    esac
}

# Run tests
run_tests() {
    print_header "Running Tests in Container"
    docker compose exec hashbuzz-backend npm test
}

# Clean up Docker resources
cleanup() {
    print_header "Cleaning Up Docker Resources"
    
    if [[ "$1" == "--all" ]]; then
        print_warning "Cleaning ALL Docker resources..."
        docker system prune -a -f
        docker volume prune -f
    else
        print_info "Cleaning unused Docker resources..."
        docker system prune -f
    fi
    
    print_info "Cleanup completed!"
}

# Check service health
check_health() {
    print_header "Checking Service Health"
    
    print_info "Container status:"
    docker compose ps
    
    print_info "\nHealth checks:"
    docker compose exec hashbuzz-backend curl -f http://localhost:4000/health || print_error "API health check failed"
    
    print_info "\nResource usage:"
    docker stats --no-stream
}

# Create database backup
create_backup() {
    print_header "Creating Database Backup"
    
    local backup_file="backup_$(date +%Y%m%d_%H%M%S).sql"
    docker compose exec postgres pg_dump -U hashbuzz hashbuzz > "$backup_file"
    
    print_info "Backup created: $backup_file"
}

# Main script logic
main() {
    case "$1" in
        "build")
            build_image "$2"
            ;;
        "dev")
            start_dev "$2" "$3"
            ;;
        "prod")
            start_prod "$2" "$3"
            ;;
        "stop")
            stop_services
            ;;
        "restart")
            restart_services
            ;;
        "logs")
            show_logs "$2" "$3"
            ;;
        "shell")
            access_shell
            ;;
        "db")
            db_operations "$2"
            ;;
        "test")
            run_tests
            ;;
        "clean")
            cleanup "$2"
            ;;
        "health")
            check_health
            ;;
        "backup")
            create_backup
            ;;
        "help"|"")
            show_usage
            ;;
        *)
            print_error "Unknown command: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
