# SCCPMS Security Policy

## Overview

This document outlines the security policies and procedures for the SCCPMS (Smart Campus Clinic Patient Management System).

## Security Principles

1. **Defense in Depth**: Multiple layers of security controls
2. **Least Privilege**: Users have minimum necessary access
3. **Zero Trust**: Verify every request and user
4. **Security by Design**: Security built into every component
5. **Continuous Monitoring**: Constant vigilance and improvement

## Authentication & Authorization

### Multi-Factor Authentication (MFA)

- **Required**: All users must use SMS-based OTP verification
- **Process**: Password → OTP verification → Session establishment
- **OTP Configuration**: 6-digit codes, 15-minute expiry, 10 attempts per window
- **Provider**: Africa's Talking SMS service

### Session Management

- **Session Duration**: 24 hours maximum
- **Session Timeout**: 30 minutes of inactivity
- **Secure Storage**: Sessions stored in database with encryption
- **Concurrent Sessions**: Maximum 3 concurrent sessions per user

### Role-Based Access Control (RBAC)

**Roles:**
- **Admin**: Full system access
- **Doctor**: Clinical operations, patient care
- **Receptionist**: Front desk operations, scheduling
- **Patient**: Personal health information only

**Access Matrix:**
- Read/Write access based on role
- Data isolation by patient
- Administrative actions require elevated privileges

## Data Protection

### Encryption

**At Rest:**
- Database: PostgreSQL encryption (AES-256)
- File system: Full disk encryption (LUKS)
- Backups: Encrypted before offsite storage

**In Transit:**
- TLS 1.2+ for all connections
- Certificate pinning for external services
- HSTS headers enabled

### Data Classification

**PHI (Protected Health Information):**
- Medical records
- Patient demographics
- Clinical notes
- Lab results
- Prescriptions

**Confidential:**
- User credentials
- Staff information
- System configuration

**Public:**
- Clinic hours
- Doctor directory (names only)
- General clinic information

### Data Retention

- **Active Patients**: Retained while account active + 7 years
- **Inactive Patients**: 10 years after last activity
- **Audit Logs**: 7 years
- **System Logs**: 90 days
- **Backups**: 30 days (daily), 1 year (monthly)

## Network Security

### Firewall Rules

**Inbound:**
- Port 80/443 (HTTP/HTTPS): Web application
- Port 22 (SSH): Admin access (restricted IPs only)
- Port 4000 (API): Backend server (internal only)

**Outbound:**
- Database server: 5432
- Supabase API: 443
- Africa's Talking SMS: 443
- DNS: 53

### DDoS Protection

- **Rate Limiting**: Tiered rate limiting by endpoint
- **WAF**: Web Application Firewall rules
- **Cloudflare**: CDN and DDoS protection (optional)
- **Monitoring**: Real-time traffic analysis

### Network Segmentation

- **DMZ**: Public-facing web servers
- **Application Zone**: Backend API servers
- **Database Zone**: Database servers
- **Management Zone**: Administrative access

## Application Security

### Input Validation

- **Type Checking**: Zod schema validation on all inputs
- **Sanitization**: XSS prevention, SQL injection prevention
- **Length Limits**: Maximum field lengths enforced
- **Format Validation**: Phone numbers, emails, dates

### Output Encoding

- **HTML Encoding**: All user-generated content
- **JSON Encoding**: API responses
- **Context-Aware**: Different encoding for different contexts

### Security Headers

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
Referrer-Policy: no-referrer-when-downgrade
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### Secure Coding Practices

- **No SQL Injection**: Parameterized queries only
- **No XSS**: Content sanitization and CSP
- **No CSRF**: CSRF tokens for state-changing operations
- **Error Handling**: Generic error messages, detailed logging
- **Secrets Management**: Environment variables, no hardcoded secrets

## Database Security

### Access Controls

- **Least Privilege**: Database users have minimum required permissions
- **Row-Level Security**: Users can only access their own data
- **Connection Encryption**: SSL required for all connections
- **Query Logging**: All data access logged for audit

### Encryption

- **Database Encryption**: AES-256 for sensitive columns
- **Backup Encryption**: GPG encryption for offsite backups
- **Key Management**: Hardware security module (HSM) for master keys

### Database Hardening

- **Parameterized Queries**: Prevent SQL injection
- **Prepared Statements**: Reusable query plans
- **Connection Pooling**: Configured with limits
- **Query Timeouts**: 30-second maximum

## Audit & Compliance

### Audit Logging

**Logged Events:**
- User authentication (success/failure)
- Data access (read/write)
- Configuration changes
- Administrative actions
- Security incidents

**Audit Trail:**
- Timestamp
- User ID
- Action performed
- Entity affected
- IP address
- Success/failure status

### Compliance Frameworks

- **POPIA**: South African data protection (primary compliance)
- **GDPR**: General data protection (if applicable)
- **ISO 27001**: Information security management

### Penetration Testing

- **Frequency**: Quarterly
- **Scope**: Full application stack
- **Method**: Third-party security firm
- **Remediation**: Critical issues within 7 days

## Incident Response

### Incident Types

- **Security Breach**: Unauthorized access to PHI
- **Data Loss**: Accidental or malicious data deletion
- **Service Disruption**: Denial of service or system failure
- **Malware**: Virus, ransomware, or other malicious software

### Response Process

1. **Detection**: Monitoring alerts or user reports
2. **Containment**: Isolate affected systems
3. **Eradication**: Remove threat, patch vulnerabilities
4. **Recovery**: Restore systems from backups
5. **Lessons Learned**: Document and improve procedures

### Breach Notification

- **HIPAA**: Within 60 days of discovery
- **POPIA**: Within reasonable time (typically 72 hours)
- **Affected Parties**: All patients whose data was compromised
- **Regulatory Bodies**: Information Commissioner, Health Department

## Security Training

### Training Requirements

- **New Employees**: Security training within 30 days
- **Annual Training**: Security awareness refresher
- **Role-Specific**: Clinical staff receive HIPAA training
- **Phishing Simulations**: Quarterly phishing tests

### Training Topics

- Password security
- Data handling procedures
- Incident reporting
- HIPAA compliance
- Social engineering awareness
- Physical security

## Physical Security

### Data Center Security

- **Access Control**: Biometric authentication + key cards
- **CCTV Monitoring**: 24/7 video surveillance
- **Visitor Management**: Escort required for all visitors
- **Environmental Controls**: Temperature, humidity, fire suppression

### Device Security

- **Laptop Encryption**: Full disk encryption required
- **Mobile Device Management**: MDM for company devices
- **USB Policy**: Restricted USB access
- **Screen Lock**: 5-minute automatic lock

## Third-Party Security

### Service Provider Assessment

- **Due Diligence**: Security assessment before onboarding
- **Contracts**: SLAs with security requirements
- **Monitoring**: Regular performance and security reviews
- **Incident Response**: Coordination for shared incidents

### Africa's Talking (SMS)

- **API Credentials**: Encrypted storage
- **Rate Limits**: Provider and application limits
- **Message Content**: No PHI in SMS messages
- **Delivery Confirmation**: Logging for audit trail

### Supabase (Authentication & Database)

- **Service Role Keys**: Restricted access
- **RLS Policies**: Row-level security enabled
- **Backup**: Automated daily backups
- **Monitoring**: Service status and usage

## Security Monitoring

### Real-Time Monitoring

- **Application Logs**: All security events logged
- **Network Logs**: Traffic analysis and anomaly detection
- **Database Logs**: Query performance and access patterns
- **System Logs**: Resource utilization and errors

### Alerting

- **Critical Alerts**: Immediate notification
- **Warning Alerts**: Within 15 minutes
- **Info Alerts**: Daily digest

### Metrics

- **Security Metrics**: Failed logins, blocked IPs, rate limit hits
- **Performance Metrics**: Response times, error rates
- **Compliance Metrics**: Audit log completeness, training completion

## Security Maintenance

### Patch Management

- **Operating System**: Security patches within 30 days
- **Application**: Security updates within 7 days
- **Dependencies**: Regular vulnerability scanning
- **Testing**: Test patches in staging first

### Vulnerability Scanning

- **Frequency**: Weekly automated scans
- **Tools**: OWASP ZAP, Nessus, Qualys
- **Reporting**: Risk assessment and remediation timeline
- **Remediation**: Critical vulnerabilities within 7 days

### Security Reviews

- **Code Reviews**: Security-focused code review
- **Architecture Reviews**: Design security assessment
- **Penetration Testing**: Quarterly external testing
- **Compliance Audits**: Annual security audit

## User Security Responsibilities

### Password Requirements

- **Length**: Minimum 12 characters
- **Complexity**: Mix of letters, numbers, special characters
- **Rotation**: Every 90 days
- **History**: No reuse of last 10 passwords

### Device Security

- **Updates**: Keep OS and applications updated
- **Antivirus**: Required for all devices
- **VPN**: Required for remote access
- **Personal Devices**: No personal devices for patient data

### Reporting Security Issues

- **Phishing**: Report suspicious emails
- **Incidents**: Report security incidents immediately
- **Concerns**: Contact security team with questions
- **Breach**: Report suspected data breaches

## Contact Information

### Security Team

- **Security Officer**: [Name] - [Email] - [Phone]
- **Privacy Officer**: [Name] - [Email] - [Phone]
- **IT Security**: [Name] - [Email] - [Phone]

### Emergency Contacts

- **Security Incident**: [Phone] - 24/7
- **Data Breach**: [Phone] - 24/7
- **System Emergency**: [Phone] - 24/7

---

**Document Version**: 1.0
**Last Updated**: [Date]
**Next Review**: [Date]
**Approved By**: [Name, Title]