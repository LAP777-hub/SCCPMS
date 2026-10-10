# SCCPMS Operations Runbook & Troubleshooting Guide

This guide provides operational procedures and troubleshooting steps for the SCCPMS (Smart Campus Clinic Patient Management System).

## Table of Contents

1. [System Overview](#system-overview)
2. [Daily Operations](#daily-operations)
3. [Incident Response](#incident-response)
4. [Troubleshooting Guide](#troubleshooting-guide)
5. [Maintenance Procedures](#maintenance-procedures)
6. [Monitoring & Alerting](#monitoring--alerting)
7. [Backup & Recovery](#backup--recovery)
8. [Security Procedures](#security-procedures)

## System Overview

### Architecture Components

- **Frontend**: React/Vite application served via Nginx
- **Backend**: Node.js/Express API server
- **Database**: PostgreSQL 14+
- **Authentication**: Supabase Auth with SMS OTP
- **SMS Provider**: Africa's Talking

### Key Services

- `sccpms-frontend` - Frontend web application (Port 80/443)
- `sccpms-backend` - API server (Port 4000)
- `postgresql` - Database server (Port 5432)

### Critical Dependencies

- Internet connectivity for SMS OTP
- Supabase API availability
- Africa's Talking SMS service
- Database connectivity

## Daily Operations

### Morning Checklist

- [ ] Check system status: `curl https://api.your-domain.com/healthz`
- [ ] Review error logs from last 24 hours
- [ ] Verify backup completion
- [ ] Check disk space usage (>80% threshold)
- [ ] Monitor database connection pool
- [ ] Review SSL certificate expiry

### Evening Checklist

- [ ] Review daily error logs
- [ ] Check system performance metrics
- [ ] Verify backup integrity
- [ ] Review security logs for suspicious activity
- [ ] Monitor resource utilization

### Weekly Tasks

- [ ] Review system performance trends
- [ ] Check for security updates
- [ ] Review audit logs for unusual patterns
- [ ] Test backup restoration
- [ ] Review and clean up old logs

### Monthly Tasks

- [ ] Security audit and vulnerability scan
- [ ] Database maintenance (VACUUM, ANALYZE)
- [ ] Review and update documentation
- [ ] Capacity planning review
- [ ] Disaster recovery drill

## Incident Response

### Severity Levels

**P1 - Critical**: System completely down, affecting all users
**P2 - High**: Major functionality degraded, affecting many users
**P3 - Medium**: Partial functionality affected, limited user impact
**P4 - Low**: Minor issues, minimal user impact

### Incident Response Procedure

1. **Detection**
   - Monitor alerts and logs
   - User reports
   - Automated monitoring triggers

2. **Assessment**
   - Determine severity level
   - Identify affected components
   - Estimate impact scope

3. **Containment**
   - Isolate affected systems if needed
   - Implement temporary fixes
   - Prevent further damage

4. **Resolution**
   - Apply permanent fix
   - Test thoroughly
   - Deploy to production

5. **Recovery**
   - Restore normal operations
   - Verify system functionality
   - Monitor for recurrence

6. **Post-Incident**
   - Document incident details
   - Root cause analysis
   - Implement preventive measures
   - Update runbooks

### Communication Protocol

- **P1/P2**: Immediate notification to all stakeholders
- **P3**: Notification within 1 hour
- **P4**: Notification within 24 hours

## Troubleshooting Guide

### Application Won't Start

**Symptoms**: Services fail to start, timeout errors

**Diagnosis**:
```bash
# Check service status
sudo systemctl status sccpms-backend
sudo systemctl status sccpms-frontend

# Check logs
sudo journalctl -u sccpms-backend -n 100
sudo journalctl -u sccpms-frontend -n 100

# Check port availability
sudo netstat -tulpn | grep :4000
sudo netstat -tulpn | grep :80
```

**Common Causes**:
- Port already in use
- Missing environment variables
- Database connection failure
- File permission issues

**Solutions**:
```bash
# Kill process using port
sudo fuser -k 4000/tcp

# Check environment variables
sudo systemctl show sccpms-backend --property=Environment

# Test database connection
psql -U sccpms_user -d sccpms -h localhost

# Fix permissions
sudo chown -R www-data:www-data /var/www/sccpms
```

### Database Connection Issues

**Symptoms**: API returns 503 errors, database connection timeouts

**Diagnosis**:
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
psql -U sccpms_user -d sccpms -h localhost

# Check connection pool
SELECT count(*) FROM pg_stat_activity WHERE datname = 'sccpms';
```

**Common Causes**:
- PostgreSQL service down
- Connection pool exhausted
- Network connectivity issues
- Authentication failures

**Solutions**:
```bash
# Restart PostgreSQL
sudo systemctl restart postgresql

# Kill idle connections
SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
WHERE datname = 'sccpms' AND state = 'idle' AND query_start < now() - interval '1 hour';

# Check connection limits
SHOW max_connections;
```

### SMS OTP Not Sending

**Symptoms**: Users cannot receive OTP codes

**Diagnosis**:
```bash
# Check SMS service logs
sudo journalctl -u sccpms-backend | grep -i sms

# Test Africa's Talking API
curl -X POST https://api.africastalking.com/version1/messaging \
  -d "username=YOUR_USERNAME" \
  -d "to=TEST_NUMBER" \
  -d "message=Test"
```

**Common Causes**:
- Invalid API credentials
- Insufficient SMS credits
- Network connectivity issues
- Invalid phone number format

**Solutions**:
```bash
# Verify credentials in .env file
cat /var/www/sccpms/server/.env | grep AFRICASTALKING

# Check API credits balance via Africa's Talking dashboard

# Test phone number format (must be international: +27123456789)
```

### High CPU/Memory Usage

**Symptoms**: System slow, high resource utilization

**Diagnosis**:
```bash
# Check system resources
htop
top

# Check process details
ps aux | grep node
ps aux | grep postgres

# Check database query performance
SELECT query, mean_exec_time, calls FROM pg_stat_statements 
ORDER BY mean_exec_time DESC LIMIT 10;
```

**Common Causes**:
- Inefficient database queries
- Memory leaks
- High traffic volume
- Background job issues

**Solutions**:
```bash
# Restart services
sudo systemctl restart sccpms-backend

# Optimize database queries
EXPLAIN ANALYZE <slow-query>;

# Increase connection pool size in configuration
```

### Slow API Response Times

**Symptoms**: API requests taking >2 seconds

**Diagnosis**:
```bash
# Check API response times
curl -w "@curl-format.txt" -o /dev/null -s https://api.your-domain.com/healthz

# Check database query performance
SELECT query, mean_exec_time, calls FROM pg_stat_statements 
ORDER BY mean_exec_time DESC LIMIT 10;

# Check network latency
ping api.your-domain.com
```

**Common Causes**:
- Slow database queries
- Network latency
- Resource contention
- External API calls

**Solutions**:
```bash
# Add database indexes
CREATE INDEX idx_appointments_starts_at ON appointments(starts_at);

# Enable query caching
# Consider Redis for caching

# Optimize external API calls
```

### SSL Certificate Issues

**Symptoms**: Browser warnings, certificate errors

**Diagnosis**:
```bash
# Check certificate status
sudo certbot certificates

# Check certificate expiry
echo | openssl s_client -connect your-domain.com:443 2>/dev/null | openssl x509 -noout -dates

# Test SSL configuration
curl -I https://your-domain.com
```

**Common Causes**:
- Certificate expired
- Certificate not installed correctly
- Domain mismatch
- CA chain issues

**Solutions**:
```bash
# Renew certificate
sudo certbot renew

# Force renewal
sudo certbot renew --force-renewal

# Reinstall certificate
sudo certbot --nginx -d your-domain.com --force-renewal
```

### Authentication Failures

**Symptoms**: Users cannot log in, OTP verification fails

**Diagnosis**:
```bash
# Check Supabase service status
curl https://your-project.supabase.co/healthz

# Check authentication logs
sudo journalctl -u sccpms-backend | grep -i auth

# Test Supabase connection
curl -X POST https://your-project.supabase.co/auth/v1/token?grant_type=password \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'
```

**Common Causes**:
- Supabase service down
- Invalid credentials
- OTP session expired
- Database connection issues

**Solutions**:
```bash
# Check Supabase status dashboard
# Verify service role key
# Clear OTP sessions
DELETE FROM otp_verified_sessions WHERE expires_at < now();
```

## Maintenance Procedures

### Database Maintenance

**Weekly VACUUM**:
```sql
VACUUM ANALYZE appointments;
VACUUM ANALYZE patient_visits;
VACUUM ANALYZE prescriptions;
```

**Index Maintenance**:
```sql
REINDEX TABLE appointments;
REINDEX TABLE patient_visits;
```

**Statistics Update**:
```sql
ANALYZE appointments;
ANALYZE patient_visits;
ANALYZE prescriptions;
```

### Log Rotation

Configure logrotate for application logs:

```bash
sudo nano /etc/logrotate.d/sccpms
```

```
/var/log/sccpms/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        systemctl reload sccpms-backend
    endscript
}
```

### System Updates

**Package Updates**:
```bash
# Update system packages
sudo apt-get update
sudo apt-get upgrade

# Update Node.js dependencies
cd /var/www/sccpms
npm update
cd server
npm update
```

**Security Updates**:
```bash
# Check for security vulnerabilities
npm audit
npm audit fix

# Update PostgreSQL
sudo apt-get install postgresql-14
```

## Monitoring & Alerting

### Key Metrics to Monitor

**System Metrics**:
- CPU usage (>80% alert)
- Memory usage (>85% alert)
- Disk space (>80% alert)
- Network latency (>500ms alert)

**Application Metrics**:
- API response time (>2s alert)
- Error rate (>5% alert)
- Database connection pool (>80% alert)
- OTP failure rate (>10% alert)

**Business Metrics**:
- Failed login attempts (>100/hour alert)
- Database query timeouts (>10/min alert)
- SMS delivery failures (>5% alert)

### Monitoring Setup

**Health Check Script**:
```bash
#!/bin/bash
# Health check monitoring script

HEALTH_URL="https://api.your-domain.com/healthz"
ALERT_EMAIL="admin@your-domain.com"

response=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $response -ne 200 ]; then
    echo "Health check failed with status: $response" | mail -s "SCCPMS Health Alert" $ALERT_EMAIL
fi
```

**Set up cron job**:
```bash
# Add to crontab
*/5 * * * * /path/to/health-check.sh
```

## Backup & Recovery

### Backup Procedures

**Daily Database Backup**:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/sccpms"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -U sccpms_user -h localhost sccpms | gzip > "$BACKUP_DIR/sccpms_$TIMESTAMP.sql.gz"

# Keep last 30 days
find $BACKUP_DIR -name "sccpms_*.sql.gz" -mtime +30 -delete
```

**Application Backup**:
```bash
# Backup application files
tar -czf /var/backups/sccpms/app_$(date +%Y%m%d).tar.gz /var/www/sccpms
```

### Recovery Procedures

**Database Recovery**:
```bash
# Stop application
sudo systemctl stop sccpms-backend

# Restore from backup
gunzip < /var/backups/sccpms/sccpms_YYYYMMDD_HHMMSS.sql.gz | psql -U sccpms_user -d sccpms

# Restart application
sudo systemctl start sccpms-backend
```

**Application Recovery**:
```bash
# Restore application files
tar -xzf /var/backups/sccpms/app_YYYYMMDD.tar.gz -C /

# Restart services
sudo systemctl restart sccpms-backend
sudo systemctl restart sccpms-frontend
```

## Security Procedures

### Security Audit

**Weekly Security Check**:
```bash
# Check for failed login attempts
sudo journalctl -u sccpms-backend | grep -i "failed" | tail -100

# Check for suspicious API calls
sudo journalctl -u sccpms-backend | grep -i "suspicious" | tail -100

# Review audit log
SELECT * FROM audit_events WHERE created_at > now() - interval '7 days' ORDER BY created_at DESC;
```

### Incident Response

**Security Incident Steps**:
1. Isolate affected systems
2. Preserve evidence (logs, memory dumps)
3. Change all credentials
4. Review audit logs
5. Patch vulnerabilities
6. Monitor for recurrence
7. Document incident

### Access Control

**User Access Review**:
```sql
-- Review user access
SELECT id, email, role, created_at FROM profiles WHERE role = 'admin';

-- Review recent admin actions
SELECT * FROM audit_events WHERE actor_user_id IN (
  SELECT id FROM profiles WHERE role = 'admin'
) AND created_at > now() - interval '30 days';
```

## Emergency Contacts

- **Primary Admin**: [Name] - [Phone] - [Email]
- **Database Admin**: [Name] - [Phone] - [Email]
- **Security Team**: [Name] - [Phone] - [Email]
- **Management**: [Name] - [Phone] - [Email]

## Escalation Matrix

| Issue Type | Level 1 | Level 2 | Level 3 |
|------------|--------|--------|--------|
| System Down | DevOps Lead | CTO | CEO |
| Security Breach | Security Lead | CTO | CEO |
| Data Loss | DBA Lead | CTO | CEO |
| Performance | DevOps Lead | CTO | - |

## Documentation Updates

This runbook should be reviewed and updated:
- After any major incident
- Quarterly
- When system architecture changes
- When new procedures are implemented

**Last Updated**: [Date]
**Updated By**: [Name]
**Version**: [Version Number]