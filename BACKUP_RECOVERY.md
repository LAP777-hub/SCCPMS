# SCCPMS Backup and Recovery Procedures

This document outlines comprehensive backup and recovery procedures for the SCCPMS (Smart Campus Clinic Patient Management System).

## Table of Contents

1. [Backup Strategy](#backup-strategy)
2. [Automated Backup Scripts](#automated-backup-scripts)
3. [Manual Backup Procedures](#manual-backup-procedures)
4. [Recovery Procedures](#recovery-procedures)
5. [Migration Procedures](#migration-procedures)
6. [Backup Verification](#backup-verification)
7. [Disaster Recovery](#disaster-recovery)

## Backup Strategy

### Backup Components

1. **Database Backups**
   - PostgreSQL database dumps
   - Transaction log backups
   - Schema-only backups

2. **Application Backups**
   - Source code
   - Configuration files
   - Environment variables
   - Static assets

3. **File System Backups**
   - Uploaded documents
   - Generated reports
   - Log files

### Backup Schedule

| Backup Type | Frequency | Retention | Location |
|-------------|-----------|-----------|----------|
| Database Full | Daily | 30 days | Local + Remote |
| Database Incremental | Hourly | 7 days | Local |
| Application | Weekly | 4 weeks | Local + Remote |
| Configuration | Per change | 6 months | Remote |
| Logs | Daily | 90 days | Local |

### Backup Locations

**Primary Storage**: `/var/backups/sccpms/`
**Secondary Storage**: Remote S3/Glacier storage
**Off-site**: Secondary data center location

## Automated Backup Scripts

### Database Backup Script

Create `/usr/local/bin/sccpms-db-backup.sh`:

```bash
#!/bin/bash

# SCCPMS Database Backup Script
# Usage: sccpms-db-backup.sh [full|incremental]

set -e

# Configuration
BACKUP_DIR="/var/backups/sccpms/database"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="sccpms"
DB_USER="sccpms_user"
DB_HOST="localhost"
BACKUP_TYPE="${1:-full}"
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR/full"
mkdir -p "$BACKUP_DIR/incremental"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$BACKUP_DIR/backup.log"
}

case $BACKUP_TYPE in
    full)
        log "Starting full database backup..."
        
        # Full database dump
        pg_dump -U "$DB_USER" -h "$DB_HOST" -d "$DB_NAME" \
            --format=custom \
            --file="$BACKUP_DIR/full/sccpms_full_$TIMESTAMP.dump"
        
        # Compress backup
        gzip "$BACKUP_DIR/full/sccpms_full_$TIMESTAMP.dump"
        
        log "Full backup completed: sccpms_full_$TIMESTAMP.dump.gz"
        
        # Clean up old backups
        find "$BACKUP_DIR/full" -name "sccpms_full_*.dump.gz" -mtime +$RETENTION_DAYS -delete
        log "Cleaned up backups older than $RETENTION_DAYS days"
        ;;
        
    incremental)
        log "Starting incremental database backup..."
        
        # Transaction log backup
        pg_dump -U "$DB_USER" -h "$DB_HOST" -d "$DB_NAME" \
            --format=custom \
            --section=data \
            --file="$BACKUP_DIR/incremental/sccpms_incremental_$TIMESTAMP.dump"
        
        # Compress backup
        gzip "$BACKUP_DIR/incremental/sccpms_incremental_$TIMESTAMP.dump"
        
        log "Incremental backup completed: sccpms_incremental_$TIMESTAMP.dump.gz"
        
        # Clean up old incremental backups
        find "$BACKUP_DIR/incremental" -name "sccpms_incremental_*.dump.gz" -mtime +7 -delete
        log "Cleaned up incremental backups older than 7 days"
        ;;
        
    *)
        log "Error: Invalid backup type. Use 'full' or 'incremental'"
        exit 1
        ;;
esac

# Verify backup
if [ -f "$BACKUP_DIR/${BACKUP_TYPE}/sccpms_${BACKUP_TYPE}_$TIMESTAMP.dump.gz" ]; then
    log "Backup verification successful"
else
    log "Error: Backup file not found"
    exit 1
fi

# Sync to remote storage (if configured)
if command -v rclone &> /dev/null; then
    log "Syncing to remote storage..."
    rclone sync "$BACKUP_DIR" remote:sccpms-backups
    log "Remote sync completed"
fi

log "Backup process completed successfully"
```

### Application Backup Script

Create `/usr/local/bin/sccpms-app-backup.sh`:

```bash
#!/bin/bash

# SCCPMS Application Backup Script
# Usage: sccpms-app-backup.sh

set -e

# Configuration
BACKUP_DIR="/var/backups/sccpms/application"
APP_DIR="/var/www/sccpms"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_WEEKS=4

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$BACKUP_DIR/backup.log"
}

log "Starting application backup..."

# Backup source code
tar -czf "$BACKUP_DIR/sccpms_app_$TIMESTAMP.tar.gz" \
    --exclude=node_modules \
    --exclude=dist \
    --exclude=.git \
    --exclude=logs \
    "$APP_DIR"

log "Application backup completed: sccpms_app_$TIMESTAMP.tar.gz"

# Backup configuration files
tar -czf "$BACKUP_DIR/sccpms_config_$TIMESTAMP.tar.gz" \
    "$APP_DIR/.env" \
    "$APP_DIR/server/.env" \
    /etc/nginx/sites-available/sccpms \
    /etc/systemd/system/sccpms-*.service

log "Configuration backup completed: sccpms_config_$TIMESTAMP.tar.gz"

# Clean up old backups
find "$BACKUP_DIR" -name "sccpms_app_*.tar.gz" -mtime +$((RETENTION_WEEKS * 7)) -delete
find "$BACKUP_DIR" -name "sccpms_config_*.tar.gz" -mtime +180 -delete

log "Cleaned up old backups"

# Sync to remote storage
if command -v rclone &> /dev/null; then
    log "Syncing to remote storage..."
    rclone sync "$BACKUP_DIR" remote:sccpms-backups/application
    log "Remote sync completed"
fi

log "Application backup process completed successfully"
```

### Cron Job Configuration

Add to crontab (`sudo crontab -e`):

```bash
# Database backups
0 2 * * * /usr/local/bin/sccpms-db-backup.sh full >> /var/backups/sccpms/database/cron.log 2>&1
0 * * * * /usr/local/bin/sccpms-db-backup.sh incremental >> /var/backups/sccpms/database/cron.log 2>&1

# Application backups
0 3 * * 0 /usr/local/bin/sccpms-app-backup.sh >> /var/backups/sccpms/application/cron.log 2>&1

# Backup verification
0 4 * * * /usr/local/bin/sccpms-verify-backups.sh >> /var/backups/sccpms/verify.log 2>&1
```

## Manual Backup Procedures

### Manual Database Backup

```bash
# Full backup
pg_dump -U sccpms_user -h localhost -d sccpms \
    --format=custom \
    --file=/tmp/sccpms_manual_backup.dump

# Compress
gzip /tmp/sccpms_manual_backup.dump

# SQL format backup
pg_dump -U sccpms_user -h localhost -d sccpms \
    --format=plain \
    --file=/tmp/sccpms_manual_backup.sql
```

### Manual Application Backup

```bash
# Backup entire application
tar -czf /tmp/sccpms_manual_app_backup.tar.gz \
    --exclude=node_modules \
    --exclude=dist \
    /var/www/sccpms

# Backup only configuration
tar -czf /tmp/sccpms_manual_config_backup.tar.gz \
    /var/www/sccpms/.env \
    /var/www/sccpms/server/.env \
    /etc/nginx/sites-available/sccpms
```

### Backup Before Major Changes

```bash
# Before deployment
/usr/local/bin/sccpms-db-backup.sh full
/usr/local/bin/sccpms-app-backup.sh

# Before database migration
pg_dump -U sccpms_user -h localhost -d sccpms \
    --format=custom \
    --file=/var/backups/sccpms/pre_migration_backup.dump
```

## Recovery Procedures

### Database Recovery

**From Full Backup**:
```bash
#!/bin/bash

# Database recovery script
BACKUP_FILE="$1"
DB_NAME="sccpms"
DB_USER="sccpms_user"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file>"
    exit 1
fi

# Stop application
sudo systemctl stop sccpms-backend

# Drop existing database (CAUTION!)
sudo -u postgres dropdb "$DB_NAME"

# Create new database
sudo -u postgres createdb "$DB_NAME" -O "$DB_USER"

# Restore from backup
if [[ $BACKUP_FILE == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" | pg_restore -U "$DB_USER" -d "$DB_NAME"
else
    pg_restore -U "$DB_USER" -d "$DB_NAME" "$BACKUP_FILE"
fi

# Start application
sudo systemctl start sccpms-backend

echo "Database recovery completed"
```

**Point-in-Time Recovery**:
```bash
# Restore to specific point in time
pg_restore -U sccpms_user -d sccpms \
    --use-list=sccpms_backup.list \
    /path/to/backup.dump

# Apply transaction logs
# Configure recovery in postgresql.conf
# Restart PostgreSQL
```

### Application Recovery

```bash
#!/bin/bash

# Application recovery script
BACKUP_FILE="$1"
APP_DIR="/var/www/sccpms"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file>"
    exit 1
fi

# Stop services
sudo systemctl stop sccpms-backend
sudo systemctl stop sccpms-frontend

# Backup current state
mv "$APP_DIR" "$APP_DIR.old"

# Extract backup
tar -xzf "$BACKUP_FILE" -C /var/www/

# Restore permissions
sudo chown -R www-data:www-data "$APP_DIR"
sudo chmod -R 755 "$APP_DIR"

# Restart services
sudo systemctl start sccpms-backend
sudo systemctl start sccpms-frontend

echo "Application recovery completed"
```

### Configuration Recovery

```bash
# Restore configuration files
tar -xzf /path/to/config_backup.tar.gz -C /

# Reload services
sudo systemctl reload nginx
sudo systemctl restart sccpms-backend
```

## Migration Procedures

### Database Migration

**Pre-Migration Checklist**:
- [ ] Create full backup
- [ ] Test migration in staging
- [ ] Schedule maintenance window
- [ ] Notify users
- [ ] Prepare rollback plan

**Migration Process**:
```bash
#!/bin/bash

# Database migration script
MIGRATION_FILE="$1"
DB_NAME="sccpms"
DB_USER="sccpms_user"

if [ -z "$MIGRATION_FILE" ]; then
    echo "Usage: $0 <migration_file>"
    exit 1
fi

# Create pre-migration backup
BACKUP_FILE="/var/backups/sccpms/pre_migration_$(date +%Y%m%d_%H%M%S).dump"
pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --file="$BACKUP_FILE"
echo "Pre-migration backup created: $BACKUP_FILE"

# Stop application
sudo systemctl stop sccpms-backend

# Apply migration
if psql -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"; then
    echo "Migration completed successfully"
    
    # Restart application
    sudo systemctl start sccpms-backend
    
    # Verify application health
    sleep 10
    if curl -f http://localhost:4000/healthz; then
        echo "Application health check passed"
    else
        echo "Application health check failed - initiating rollback"
        # Rollback procedure
        pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists "$BACKUP_FILE"
        sudo systemctl start sccpms-backend
        echo "Rollback completed"
        exit 1
    fi
else
    echo "Migration failed - initiating rollback"
    # Rollback procedure
    pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists "$BACKUP_FILE"
    sudo systemctl start sccpms-backend
    echo "Rollback completed"
    exit 1
fi
```

### Application Migration

**Code Deployment**:
```bash
# Use existing deployment script
./scripts/deploy.sh deploy

# Manual deployment
cd /var/www/sccpms
git pull origin main
npm ci
npm run build
sudo systemctl restart sccpms-backend
```

### Data Migration

**Export/Import Data**:
```bash
# Export specific tables
pg_dump -U sccpms_user -d sccpms \
    --table=appointments \
    --table=patient_visits \
    --format=custom \
    --file=partial_backup.dump

# Import to new database
pg_restore -U sccpms_user -d new_database partial_backup.dump
```

## Backup Verification

### Automated Verification Script

Create `/usr/local/bin/sccpms-verify-backups.sh`:

```bash
#!/bin/bash

# Backup verification script
BACKUP_DIR="/var/backups/sccpms/database"
ALERT_EMAIL="admin@your-domain.com"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$BACKUP_DIR/verify.log"
}

# Check backup existence
check_backup_existence() {
    local backup_pattern="$1"
    local latest_backup=$(ls -t "$BACKUP_DIR/$backup_pattern" 2>/dev/null | head -1)
    
    if [ -z "$latest_backup" ]; then
        log "ERROR: No backup found matching pattern: $backup_pattern"
        return 1
    fi
    
    log "Latest backup found: $latest_backup"
    return 0
}

# Verify backup integrity
verify_backup_integrity() {
    local backup_file="$1"
    
    if [[ $backup_file == *.gz ]]; then
        if gzip -t "$backup_file" 2>/dev/null; then
            log "Backup integrity check passed: $backup_file"
            return 0
        else
            log "ERROR: Backup integrity check failed: $backup_file"
            return 1
        fi
    elif [[ $backup_file == *.dump ]]; then
        if pg_restore --list "$backup_file" > /dev/null 2>&1; then
            log "Backup integrity check passed: $backup_file"
            return 0
        else
            log "ERROR: Backup integrity check failed: $backup_file"
            return 1
        fi
    fi
}

# Check backup age
check_backup_age() {
    local backup_file="$1"
    local max_age_hours=26
    
    if [ -f "$backup_file" ]; then
        backup_age=$(( ($(date +%s) - $(stat -c %Y "$backup_file")) / 3600 ))
        
        if [ $backup_age -gt $max_age_hours ]; then
            log "WARNING: Backup is older than $max_age_hours hours: $backup_file (age: ${backup_age}h)"
            return 1
        else
            log "Backup age acceptable: $backup_file (age: ${backup_age}h)"
            return 0
        fi
    fi
}

# Main verification
log "Starting backup verification..."

# Check full backup
if check_backup_existence "full/sccpms_full_*.dump.gz"; then
    latest_full=$(ls -t "$BACKUP_DIR/full/sccpms_full_*.dump.gz" 2>/dev/null | head -1)
    verify_backup_integrity "$latest_full"
    check_backup_age "$latest_full"
else
    echo "Full backup check failed" | mail -s "SCCPMS Backup Alert" $ALERT_EMAIL
fi

# Check incremental backup
if check_backup_existence "incremental/sccpms_incremental_*.dump.gz"; then
    latest_incremental=$(ls -t "$BACKUP_DIR/incremental/sccpms_incremental_*.dump.gz" 2>/dev/null | head -1)
    verify_backup_integrity "$latest_incremental"
    check_backup_age "$latest_incremental"
else
    echo "Incremental backup check failed" | mail -s "SCCPMS Backup Alert" $ALERT_EMAIL
fi

# Check backup size
check_backup_size() {
    local backup_file="$1"
    local min_size_kb=100
    
    if [ -f "$backup_file" ]; then
        backup_size_kb=$(du -k "$backup_file" | cut -f1)
        
        if [ $backup_size_kb -lt $min_size_kb ]; then
            log "WARNING: Backup size suspiciously small: $backup_file (${backup_size_kb}KB)"
            return 1
        else
            log "Backup size acceptable: $backup_file (${backup_size_kb}KB)"
            return 0
        fi
    fi
}

log "Backup verification completed"
```

### Manual Verification

```bash
# Verify backup can be restored
pg_restore --list /path/to/backup.dump

# Test restore to temporary database
createdb test_restore
pg_restore -U sccpms_user -d test_restore /path/to/backup.dump
# Verify data
dropdb test_restore
```

## Disaster Recovery

### Disaster Recovery Plan

**Scenarios**:

1. **Server Failure**
   - Spin up new server
   - Restore from latest backup
   - Update DNS records
   - Monitor for issues

2. **Database Corruption**
   - Stop application
   - Restore from last known good backup
   - Apply transaction logs
   - Verify data integrity

3. **Ransomware Attack**
   - Isolate affected systems
   - Assess damage scope
   - Restore from offline backups
   - Change all credentials
   - Investigate breach

4. **Data Center Outage**
   - Activate secondary site
   - Redirect DNS
   - Monitor performance
   - Restore primary site

### Recovery Time Objectives (RTO)

| Component | RTO | RPO |
|-----------|-----|-----|
| Database | 4 hours | 1 hour |
| Application | 2 hours | 1 day |
| Configuration | 1 hour | 1 week |

### Disaster Recovery Testing

**Monthly Test**:
1. Select random backup
2. Restore to test environment
3. Verify application functionality
4. Document any issues
5. Update procedures if needed

**Annual Full Test**:
1. Complete disaster scenario simulation
2. Test all recovery procedures
3. Evaluate team response
4. Update disaster recovery plan

### Emergency Contact Procedures

**In case of disaster**:
1. Immediate: Contact primary admin
2. Within 15 minutes: Notify management
3. Within 30 minutes: Activate disaster recovery team
4. Within 1 hour: Begin recovery procedures
5. Ongoing: Regular status updates

## Backup Monitoring

### Monitoring Metrics

- Backup success/failure rate
- Backup completion time
- Backup size trends
- Storage utilization
- Recovery test results

### Alerting Configuration

**Critical Alerts**:
- Backup failure
- Backup file corruption
- Storage space threshold exceeded
- Recovery test failure

**Warning Alerts**:
- Backup completion delay
- Storage space threshold warning
- Backup size anomaly

### Reporting

**Daily Report**:
- Backup status summary
- Storage utilization
- Any issues or warnings

**Weekly Report**:
- Backup success rate
- Recovery test results
- Storage trends
- Recommendations

## Appendix

### Backup Size Estimation

Based on current data:
- Database: ~500MB (full backup)
- Application: ~200MB
- Configuration: ~1MB
- Logs: ~50MB/day

### Storage Requirements

**Minimum**: 100GB (30 days retention)
**Recommended**: 500GB (including growth and multiple copies)

### Recovery Contact Information

- **Primary DBA**: [Name] - [Phone] - [Email]
- **System Admin**: [Name] - [Phone] - [Email]
- **Application Lead**: [Name] - [Phone] - [Email]

---

**Document Version**: 1.0
**Last Updated**: [Date]
**Next Review**: [Date]