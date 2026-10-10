#!/bin/bash

# SCCPMS Deployment Script
# This script handles the deployment of both frontend and backend

set -e

echo "🚀 Starting SCCPMS deployment..."

# Configuration
FRONTEND_DIR="./"
BACKEND_DIR="./server"
BUILD_DIR="./dist"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if required environment variables are set
check_env_vars() {
    print_status "Checking environment variables..."
    
    required_vars=("VITE_SUPABASE_URL" "VITE_SUPABASE_ANON_KEY" "VITE_API_URL")
    missing_vars=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -ne 0 ]; then
        print_error "Missing required environment variables: ${missing_vars[*]}"
        print_error "Please set these variables or use .env.production file"
        exit 1
    fi

    print_status "All required environment variables are set"
}

# Create backup of current deployment
create_backup() {
    print_status "Creating backup of current deployment..."
    
    mkdir -p "$BACKUP_DIR"
    
    if [ -d "$BUILD_DIR" ]; then
        tar -czf "$BACKUP_DIR/frontend_backup_$TIMESTAMP.tar.gz" "$BUILD_DIR"
        print_status "Frontend backup created: $BACKUP_DIR/frontend_backup_$TIMESTAMP.tar.gz"
    fi

    if [ -d "$BACKEND_DIR/dist" ]; then
        tar -czf "$BACKUP_DIR/backend_backup_$TIMESTAMP.tar.gz" "$BACKEND_DIR/dist"
        print_status "Backend backup created: $BACKUP_DIR/backend_backup_$TIMESTAMP.tar.gz"
    fi
}

# Build frontend
build_frontend() {
    print_status "Building frontend..."
    
    cd "$FRONTEND_DIR"
    npm ci
    npm run build
    
    if [ $? -eq 0 ]; then
        print_status "Frontend build completed successfully"
    else
        print_error "Frontend build failed"
        exit 1
    fi
}

# Build backend
build_backend() {
    print_status "Building backend..."
    
    cd "$BACKEND_DIR"
    npm ci
    npm run build
    
    if [ $? -eq 0 ]; then
        print_status "Backend build completed successfully"
    else
        print_error "Backend build failed"
        exit 1
    fi
}

# Run database migrations
run_migrations() {
    print_status "Running database migrations..."
    
    cd "$BACKEND_DIR"
    npm run db:migrate
    
    if [ $? -eq 0 ]; then
        print_status "Database migrations completed successfully"
    else
        print_error "Database migrations failed"
        exit 1
    fi
}

# Health check
health_check() {
    print_status "Performing health check..."
    
    max_attempts=30
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s http://localhost:4000/healthz > /dev/null; then
            print_status "Health check passed"
            return 0
        fi
        
        print_warning "Health check attempt $attempt/$max_attempts failed. Retrying..."
        sleep 5
        ((attempt++))
    done
    
    print_error "Health check failed after $max_attempts attempts"
    return 1
}

# Main deployment function
deploy() {
    print_status "Starting deployment process..."
    
    # Check environment
    check_env_vars
    
    # Create backup
    create_backup
    
    # Build applications
    build_frontend
    build_backend
    
    # Run migrations
    run_migrations
    
    # Restart services (if using systemd)
    if command -v systemctl &> /dev/null; then
        print_status "Restarting services..."
        sudo systemctl restart sccpms-backend
        sudo systemctl restart sccpms-frontend
    fi
    
    # Health check
    if health_check; then
        print_status "✅ Deployment completed successfully!"
        print_status "Backup location: $BACKUP_DIR"
    else
        print_error "❌ Deployment failed health check"
        print_status "You can restore from backup: $BACKUP_DIR"
        exit 1
    fi
}

# Rollback function
rollback() {
    print_status "Starting rollback process..."
    
    latest_backup=$(ls -t "$BACKUP_DIR"/frontend_backup_*.tar.gz 2>/dev/null | head -1)
    
    if [ -z "$latest_backup" ]; then
        print_error "No backup found for rollback"
        exit 1
    fi
    
    print_status "Restoring from: $latest_backup"
    
    # Extract backup
    tar -xzf "$latest_backup" -C "$FRONTEND_DIR"
    
    # Restart services
    if command -v systemctl &> /dev/null; then
        sudo systemctl restart sccpms-frontend
    fi
    
    print_status "Rollback completed"
}

# Parse command line arguments
case "${1:-deploy}" in
    deploy)
        deploy
        ;;
    rollback)
        rollback
        ;;
    *)
        echo "Usage: $0 {deploy|rollback}"
        echo "  deploy  - Deploy the application"
        echo "  rollback - Rollback to previous version"
        exit 1
        ;;
esac