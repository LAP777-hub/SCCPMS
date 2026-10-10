# SCCPMS Deployment Guide

This guide covers the deployment process for the SCCPMS (Smart Campus Clinic Patient Management System) in production environments.

## Prerequisites

- **Operating System**: Linux (Ubuntu 20.04+ recommended) or Windows Server
- **Node.js**: 18.x or higher
- **PostgreSQL**: 14.x or higher
- **Supabase**: Production account with service role key
- **Africa's Talking**: Production SMS account
- **Domain**: Registered domain with SSL certificate
- **Server**: Minimum 2GB RAM, 2 CPU cores (4GB RAM recommended)

## Pre-Deployment Checklist

- [ ] Domain configured with DNS records
- [ ] SSL certificate installed (Let's Encrypt recommended)
- [ ] PostgreSQL database created and configured
- [ ] Supabase project created in production mode
- [ ] Africa's Talking API credentials obtained
- [ ] Environment variables configured
- [ ] Firewall rules configured (ports 80, 443, 4000)
- [ ] Backup strategy implemented
- [ ] Monitoring/alerting system configured

## Environment Configuration

### 1. Frontend Environment Variables

Create `.env.production` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=https://api.your-domain.com
```

### 2. Backend Environment Variables

Create `.env` in the server directory:

```env
NODE_ENV=production
PORT=4000
FRONTEND_ORIGIN=https://your-domain.com
DATABASE_URL=postgresql://user:password@host:5432/sccpms
DATABASE_SSL_MODE=verify-full
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OTP_HMAC_SECRET=your-32-character-secret
AFRICASTALKING_USERNAME=your-username
AFRICASTALKING_API_KEY=your-api-key
AFRICASTALKING_SENDER_ID=your-sender-id
```

## Deployment Methods

### Method 1: Docker Deployment (Recommended)

#### Build and Deploy with Docker Compose

```bash
# Set environment variables
export $(cat .env.production | xargs)

# Build and start services
docker-compose up -d --build

# Check logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### Individual Container Deployment

```bash
# Build frontend
docker build -t sccpms-frontend:latest .

# Build backend
cd server
docker build -t sccpms-backend:latest .
cd ..

# Run containers
docker run -d -p 80:80 --name sccpms-frontend sccpms-frontend:latest
docker run -d -p 4000:4000 --name sccpms-backend \
  --env-file .env.production \
  sccpms-backend:latest
```

### Method 2: Manual Deployment

#### Using Deployment Scripts

**Linux/Mac:**
```bash
# Make script executable
chmod +x scripts/deploy.sh

# Deploy
./scripts/deploy.sh deploy

# Rollback if needed
./scripts/deploy.sh rollback
```

**Windows:**
```powershell
# Deploy
.\scripts\deploy.ps1 -Action deploy

# Rollback if needed
.\scripts\deploy.ps1 -Action rollback
```

#### Manual Deployment Steps

1. **Build Frontend**
```bash
npm ci
npm run build
```

2. **Build Backend**
```bash
cd server
npm ci
npm run build
cd ..
```

3. **Run Database Migrations**
```bash
cd server
npm run db:migrate
```

4. **Start Services**

**Using PM2 (Process Manager):**
```bash
# Install PM2 globally
npm install -g pm2

# Start backend
cd server
pm2 start dist/index.js --name sccpms-backend

# Start frontend (using nginx for serving static files)
# Configure nginx to serve the dist/ directory
```

**Using Systemd (Linux):**
```bash
# Create systemd service file
sudo nano /etc/systemd/system/sccpms-backend.service
```

```ini
[Unit]
Description=SCCPMS Backend API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/sccpms/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
Environment=NODE_ENV=production
EnvironmentFile=/var/www/sccpms/server/.env

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable sccpms-backend
sudo systemctl start sccpms-backend
sudo systemctl status sccpms-backend
```

## Nginx Configuration

### Frontend Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    root /var/www/sccpms/dist;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## Database Setup

### 1. Create Database User and Database

```sql
CREATE USER sccpms_user WITH PASSWORD 'secure_password';
CREATE DATABASE sccpms OWNER sccpms_user;
GRANT ALL PRIVILEGES ON DATABASE sccpms TO sccpms_user;
```

### 2. Run Migrations

```bash
cd server
npm run db:migrate
```

### 3. Create Initial Admin User

Use the Supabase dashboard to create the initial admin user, then use the API to configure their profile.

## SSL Certificate Setup

### Using Let's Encrypt (Certbot)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

## Monitoring and Logging

### Health Checks

The application provides health check endpoints:

- `GET /healthz` - Basic health check
- `GET /metrics` - Detailed metrics

Configure monitoring to check these endpoints regularly.

### Log Management

Logs are written to stdout/stderr. Configure your process manager to redirect logs:

**PM2:**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

**Systemd:**
Logs are automatically managed by journald:
```bash
sudo journalctl -u sccpms-backend -f
```

## Backup Strategy

### Database Backups

Create a backup script:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/sccpms"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -U sccpms_user -h localhost sccpms | gzip > "$BACKUP_DIR/sccpms_$TIMESTAMP.sql.gz"

# Keep only last 30 days of backups
find $BACKUP_DIR -name "sccpms_*.sql.gz" -mtime +30 -delete
```

Set up cron job for daily backups:
```bash
0 2 * * * /path/to/backup-script.sh
```

### Application Backups

The deployment scripts automatically create backups before each deployment.

## Security Hardening

### Firewall Configuration

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow backend API (if external access needed)
sudo ufw allow 4000/tcp

# Enable firewall
sudo ufw enable
```

### Security Headers

The application includes security headers via Helmet middleware. Verify they are active:

```bash
curl -I https://your-domain.com
```

## Troubleshooting

### Application Won't Start

1. Check logs: `pm2 logs` or `sudo journalctl -u sccpms-backend`
2. Verify environment variables are set
3. Check database connectivity
4. Verify ports are not already in use

### Database Connection Issues

1. Verify DATABASE_URL is correct
2. Check PostgreSQL is running: `sudo systemctl status postgresql`
3. Test connection: `psql -U sccpms_user -d sccpms -h localhost`

### SSL Certificate Issues

1. Verify certificate paths in nginx config
2. Check certificate expiration: `sudo certbot certificates`
3. Renew manually: `sudo certbot renew`

### Performance Issues

1. Check server resources: `htop`
2. Review database query performance
3. Check nginx error logs: `sudo tail -f /var/log/nginx/error.log`
4. Monitor application logs for errors

## Rollback Procedure

If deployment fails:

1. **Using deployment scripts:**
```bash
./scripts/deploy.sh rollback
```

2. **Manual rollback:**
```bash
# Restore from backup
cd backups
tar -xzf frontend_backup_[timestamp].tar.gz -C ../
tar -xzf backend_backup_[timestamp].tar.gz -C ../server/

# Restart services
sudo systemctl restart sccpms-backend
sudo systemctl reload nginx
```

## Post-Deployment Verification

1. **Health Check**
```bash
curl https://api.your-domain.com/healthz
curl https://api.your-domain.com/metrics
```

2. **Frontend Access**
- Open https://your-domain.com in browser
- Verify login functionality
- Test OTP verification

3. **API Endpoints**
- Test authentication flow
- Verify appointment booking
- Check clinical workflows

4. **Monitoring**
- Verify error tracking is working
- Check logs for errors
- Test alerting system

## Scaling Considerations

### Horizontal Scaling

- Use load balancer (nginx, HAProxy)
- Deploy multiple backend instances
- Use shared database with connection pooling
- Implement session storage (Redis)

### Database Optimization

- Enable connection pooling
- Add database indexes for frequently queried fields
- Consider read replicas for reporting queries
- Implement query caching

## Maintenance

### Regular Tasks

- **Daily**: Review error logs, check backup completion
- **Weekly**: Review system performance, security updates
- **Monthly**: Database maintenance, SSL certificate renewal check
- **Quarterly**: Security audit, dependency updates

### Updates

1. **Dependency Updates**
```bash
npm audit
npm audit fix
npm update
```

2. **Security Updates**
```bash
sudo apt-get update
sudo apt-get upgrade
```

3. **Database Updates**
- Test migrations in staging first
- Backup before running migrations
- Have rollback plan ready

## Support

For deployment issues:
- Check logs: `/var/log/sccpms/` or application logs
- Review troubleshooting section
- Check health endpoints: `/healthz`, `/metrics`
- Contact support with error logs and system information