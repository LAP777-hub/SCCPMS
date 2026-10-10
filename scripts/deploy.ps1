# SCCPMS Deployment Script for Windows
# This script handles the deployment of both frontend and backend

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("deploy", "rollback")]
    [string]$Action = "deploy"
)

$ErrorActionPreference = "Stop"

# Configuration
$FRONTEND_DIR = "."
$BACKEND_DIR = ".\server"
$BUILD_DIR = ".\dist"
$BACKUP_DIR = ".\backups"
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"

function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Error-Status {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Warning-Status {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Test-EnvironmentVariables {
    Write-Status "Checking environment variables..."
    
    $requiredVars = @("VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_API_URL")
    $missingVars = @()

    foreach ($var in $requiredVars) {
        if (-not (Test-Path "env:$var")) {
            $missingVars += $var
        }
    }

    if ($missingVars.Count -gt 0) {
        Write-Error-Status "Missing required environment variables: $($missingVars -join ', ')"
        Write-Error-Status "Please set these variables or use .env.production file"
        exit 1
    }

    Write-Status "All required environment variables are set"
}

function New-DeploymentBackup {
    Write-Status "Creating backup of current deployment..."
    
    if (-not (Test-Path $BACKUP_DIR)) {
        New-Item -ItemType Directory -Path $BACKUP_DIR | Out-Null
    }

    if (Test-Path $BUILD_DIR) {
        Compress-Archive -Path $BUILD_DIR -DestinationPath "$BACKUP_DIR\frontend_backup_$TIMESTAMP.zip" -Force
        Write-Status "Frontend backup created: $BACKUP_DIR\frontend_backup_$TIMESTAMP.zip"
    }

    if (Test-Path "$BACKEND_DIR\dist") {
        Compress-Archive -Path "$BACKEND_DIR\dist" -DestinationPath "$BACKUP_DIR\backend_backup_$TIMESTAMP.zip" -Force
        Write-Status "Backend backup created: $BACKUP_DIR\backend_backup_$TIMESTAMP.zip"
    }
}

function Build-Frontend {
    Write-Status "Building frontend..."
    
    Push-Location $FRONTEND_DIR
    try {
        npm ci
        npm run build
        
        if ($LASTEXITCODE -eq 0) {
            Write-Status "Frontend build completed successfully"
        } else {
            Write-Error-Status "Frontend build failed"
            exit 1
        }
    } finally {
        Pop-Location
    }
}

function Build-Backend {
    Write-Status "Building backend..."
    
    Push-Location $BACKEND_DIR
    try {
        npm ci
        npm run build
        
        if ($LASTEXITCODE -eq 0) {
            Write-Status "Backend build completed successfully"
        } else {
            Write-Error-Status "Backend build failed"
            exit 1
        }
    } finally {
        Pop-Location
    }
}

function Invoke-DatabaseMigrations {
    Write-Status "Running database migrations..."
    
    Push-Location $BACKEND_DIR
    try {
        npm run db:migrate
        
        if ($LASTEXITCODE -eq 0) {
            Write-Status "Database migrations completed successfully"
        } else {
            Write-Error-Status "Database migrations failed"
            exit 1
        }
    } finally {
        Pop-Location
    }
}

function Test-HealthCheck {
    Write-Status "Performing health check..."
    
    $maxAttempts = 30
    $attempt = 1
    
    while ($attempt -le $maxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:4000/healthz" -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-Status "Health check passed"
                return $true
            }
        } catch {
            Write-Warning-Status "Health check attempt $attempt/$maxAttempts failed. Retrying..."
        }
        
        Start-Sleep -Seconds 5
        $attempt++
    }
    
    Write-Error-Status "Health check failed after $maxAttempts attempts"
    return $false
}

function Invoke-Deployment {
    Write-Status "Starting deployment process..."
    
    # Check environment
    Test-EnvironmentVariables
    
    # Create backup
    New-DeploymentBackup
    
    # Build applications
    Build-Frontend
    Build-Backend
    
    # Run migrations
    Invoke-DatabaseMigrations
    
    # Health check
    if (Test-HealthCheck) {
        Write-Status "✅ Deployment completed successfully!"
        Write-Status "Backup location: $BACKUP_DIR"
    } else {
        Write-Error-Status "❌ Deployment failed health check"
        Write-Status "You can restore from backup: $BACKUP_DIR"
        exit 1
    }
}

function Invoke-Rollback {
    Write-Status "Starting rollback process..."
    
    $latestBackup = Get-ChildItem -Path "$BACKUP_DIR\frontend_backup_*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    
    if (-not $latestBackup) {
        Write-Error-Status "No backup found for rollback"
        exit 1
    }
    
    Write-Status "Restoring from: $($latestBackup.FullName)"
    
    # Remove current build
    if (Test-Path $BUILD_DIR) {
        Remove-Item -Path $BUILD_DIR -Recurse -Force
    }
    
    # Extract backup
    Expand-Archive -Path $latestBackup.FullName -DestinationPath $FRONTEND_DIR -Force
    
    Write-Status "Rollback completed"
}

# Main execution
Write-Host "🚀 Starting SCCPMS deployment..." -ForegroundColor Cyan

switch ($Action) {
    "deploy" {
        Invoke-Deployment
    }
    "rollback" {
        Invoke-Rollback
    }
    default {
        Write-Host "Usage: .\deploy.ps1 -Action {deploy|rollback}"
        Write-Host "  deploy  - Deploy the application"
        Write-Host "  rollback - Rollback to previous version"
        exit 1
    }
}