#!/usr/bin/env bash

##############################################################################
# Safe V201 Testing Script
#
# This script provides safe execution of V201 tests and audits with automatic
# data protection and recovery mechanisms.
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="./test-backups"
LOG_FILE="./logs/test-execution.log"
FORCE_MODE=false
TEST_DB_MODE=false

# Help function
show_help() {
    echo "Safe V201 Testing Script"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  audit                    Run safe V201 lifecycle audit"
    echo "  test                     Run BDD test scenarios"
    echo "  full                     Run both audit and tests"
    echo "  backup [name]            Create manual backup"
    echo "  restore [backup-file]    Restore from backup"
    echo "  list-backups             Show available backups"
    echo "  analyze-db               Analyze current database"
    echo ""
    echo "Options:"
    echo "  --force                  Force execution (bypass production protection)"
    echo "  --test-db               Use test database connection"
    echo "  --help                   Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 audit                 # Safe audit with protection"
    echo "  $0 test --test-db        # Run tests on test database"
    echo "  $0 backup before-test    # Create named backup"
    echo "  $0 restore backup.sql    # Restore from backup"
}

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    mkdir -p "$(dirname "$LOG_FILE")"
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"

    case $level in
        "ERROR")
            echo -e "${RED}❌ ERROR: $message${NC}"
            ;;
        "WARN")
            echo -e "${YELLOW}⚠️  WARNING: $message${NC}"
            ;;
        "INFO")
            echo -e "${BLUE}ℹ️  INFO: $message${NC}"
            ;;
        "SUCCESS")
            echo -e "${GREEN}✅ SUCCESS: $message${NC}"
            ;;
        *)
            echo "$message"
            ;;
    esac
}

# Check dependencies
check_dependencies() {
    log "INFO" "Checking dependencies..."

    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        log "ERROR" "Node.js is not installed or not in PATH"
        exit 1
    fi

    # Check if npm/yarn is available
    if ! command -v npm &> /dev/null && ! command -v yarn &> /dev/null; then
        log "ERROR" "Neither npm nor yarn is available"
        exit 1
    fi

    # Check if PostgreSQL client is available for backups
    if ! command -v pg_dump &> /dev/null; then
        log "WARN" "pg_dump not found - database backups may not work"
    fi

    # Check if TypeScript is available
    if ! command -v npx &> /dev/null; then
        log "ERROR" "npx is not available - cannot run TypeScript files"
        exit 1
    fi

    log "SUCCESS" "All dependencies checked"
}

# Database analysis
analyze_database() {
    log "INFO" "Analyzing current database..."

    npx ts-node -r tsconfig-paths/register src/V201/tests/integration/databaseSafetyManager.ts analyze
}

# Create backup
create_backup() {
    local backup_name=${1:-"manual-$(date +%Y%m%d-%H%M%S)"}

    log "INFO" "Creating backup: $backup_name"

    npx ts-node -r tsconfig-paths/register src/V201/tests/integration/databaseSafetyManager.ts backup "$backup_name"

    if [ $? -eq 0 ]; then
        log "SUCCESS" "Backup created successfully"
    else
        log "ERROR" "Backup creation failed"
        exit 1
    fi
}

# Restore backup
restore_backup() {
    local backup_file=$1

    if [ -z "$backup_file" ]; then
        log "ERROR" "Please specify backup file to restore"
        echo ""
        echo "Available backups:"
        npx ts-node -r tsconfig-paths/register src/V201/tests/integration/databaseSafetyManager.ts list
        exit 1
    fi

    log "WARN" "Restoring database from: $backup_file"

    read -p "Are you sure you want to restore the database? This will overwrite current data. (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log "INFO" "Restore cancelled by user"
        exit 0
    fi

    npx ts-node -r tsconfig-paths/register src/V201/tests/integration/databaseSafetyManager.ts restore "$backup_file"

    if [ $? -eq 0 ]; then
        log "SUCCESS" "Database restored successfully"
    else
        log "ERROR" "Database restore failed"
        exit 1
    fi
}

# List backups
list_backups() {
    log "INFO" "Listing available backups..."
    npx ts-node -r tsconfig-paths/register src/V201/tests/integration/databaseSafetyManager.ts list
}

# Run safe audit
run_safe_audit() {
    log "INFO" "Starting safe V201 lifecycle audit..."

    # Build options
    local force_flag=""
    if [ "$FORCE_MODE" = true ]; then
        force_flag="--force"
        log "WARN" "Force mode enabled - production protection bypassed!"
    fi

    # Set test database if requested
    if [ "$TEST_DB_MODE" = true ]; then
        log "INFO" "Using test database mode"
        export DATABASE_URL="${TEST_DATABASE_URL:-postgresql://postgres:password@localhost:5432/hashbuzz_test}"
    fi

    # Run the safe audit
    npx ts-node -r tsconfig-paths/register src/V201/tests/integration/safeAuditV201Lifecycle.ts $force_flag

    local exit_code=$?

    case $exit_code in
        0)
            log "SUCCESS" "Audit completed successfully"
            ;;
        1)
            log "ERROR" "Audit failed with issues"
            ;;
        2)
            log "INFO" "Audit protected production data - execution stopped safely"
            ;;
        *)
            log "ERROR" "Audit exited with unexpected code: $exit_code"
            ;;
    esac

    return $exit_code
}

# Run BDD tests
run_bdd_tests() {
    log "INFO" "Starting BDD test scenarios..."

    # Set test database if requested
    if [ "$TEST_DB_MODE" = true ]; then
        log "INFO" "Using test database mode"
        export DATABASE_URL="${TEST_DATABASE_URL:-postgresql://postgres:password@localhost:5432/hashbuzz_test}"
    fi

    npx ts-node -r tsconfig-paths/register src/V201/tests/integration/runV201Tests.ts

    if [ $? -eq 0 ]; then
        log "SUCCESS" "BDD tests completed successfully"
    else
        log "ERROR" "BDD tests failed"
        exit 1
    fi
}

# Run full test suite
run_full_tests() {
    log "INFO" "Starting full V201 test suite..."

    # Run audit first
    run_safe_audit
    local audit_result=$?

    if [ $audit_result -eq 2 ]; then
        log "INFO" "Audit protected production data - stopping test suite"
        return 2
    elif [ $audit_result -ne 0 ]; then
        log "WARN" "Audit had issues but continuing with tests..."
    fi

    # Run BDD tests
    run_bdd_tests

    log "SUCCESS" "Full test suite completed"
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                FORCE_MODE=true
                shift
                ;;
            --test-db)
                TEST_DB_MODE=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                break
                ;;
        esac
    done
}

# Main function
main() {
    local command=$1

    echo "🛡️  Safe V201 Testing System"
    echo "=============================="
    echo ""

    check_dependencies

    case $command in
        "audit")
            run_safe_audit
            ;;
        "test")
            run_bdd_tests
            ;;
        "full")
            run_full_tests
            ;;
        "backup")
            create_backup "$2"
            ;;
        "restore")
            restore_backup "$2"
            ;;
        "list-backups")
            list_backups
            ;;
        "analyze-db")
            analyze_database
            ;;
        "help"|"--help"|"")
            show_help
            ;;
        *)
            log "ERROR" "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Parse arguments and run
parse_args "$@"
shift $((OPTIND-1))
main "$@"
