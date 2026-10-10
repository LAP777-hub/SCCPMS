# SCCPMS Security Configuration

This document explains the security configuration of SCCPMS and how to properly manage credentials.

## ✅ Security Measures Implemented

### 1. Environment Variables (gitignored)
- ✅ `.env` files are in `.gitignore`
- ✅ `.env.local` files are in `.gitignore`
- ✅ `.env.example` files are committed with placeholders only
- ✅ `.env.production.example` files are committed with placeholders only

### 2. Frontend Configuration
**File**: `.env` (gitignored)

The frontend contains only Supabase public credentials:
- `VITE_SUPABASE_URL` - Supabase project URL (public)
- `VITE_SUPABASE_ANON_KEY` - Supabase publishable key (public)
- `VITE_API_URL` - Backend API URL (public)

⚠️ **IMPORTANT**: The Supabase publishable key is designed for browser use. Data protection is enforced via:
- Supabase Row Level Security (RLS)
- Server-side authorization
- Role-based access control

### 3. Backend Configuration
**File**: `server/.env` (gitignored)

The backend contains privileged credentials:
- `DATABASE_URL` - PostgreSQL connection string with password (SECRET)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase publishable key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase secret key (SECRET - full database access)
- `OTP_HMAC_SECRET` - OTP verification secret (SECRET)
- `AFRICASTALKING_USERNAME` - Africa's Talking username
- `AFRICASTALKING_API_KEY` - Africa's Talking API key (SECRET)

### 4. Database Security
- ✅ Connection uses SSL when in production mode
- ✅ Password is stored in environment variable only
- ✅ Never hardcoded in source code
- ✅ RLS policies restrict data access by user role

### 5. API Security
- ✅ Rate limiting enabled (100 req/15min general, 20 req/15min strict)
- ✅ Request validation with Zod schemas
- ✅ Request sanitization to prevent XSS
- ✅ Security headers (Helmet, CSP, HSTS)
- ✅ Trust proxy enabled for accurate IP detection
- ✅ JWT token verification for all protected endpoints
- ✅ OTP verification required for access

## 🔧 Environment Variable Reference

### Frontend (Safe for Browser)
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:4000
```

### Backend (Server-Only Secrets)
```env
NODE_ENV=development
PORT=4000
FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://user:password@host:5432/dbname
DATABASE_SSL_MODE=disable
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OTP_HMAC_SECRET=random-32-char-secret
AFRICASTALKING_USERNAME=sandbox
AFRICASTALKING_API_KEY=your-api-key
AFRICASTALKING_SENDER_ID=
```

## 🚨 Security Checklist

Before committing or deploying:

- [ ] Real `.env` files are not staged or committed
- [ ] No secrets in source code, screenshots, logs, or issue reports
- [ ] Frontend variables use `VITE_` prefix only for safe values
- [ ] Supabase RLS is enabled with restrictive policies
- [ ] Backend verifies authentication on all protected operations
- [ ] Patient data is restricted by role and ownership
- [ ] Production credentials are separate from development
- [ ] Secrets are rotated if ever exposed

## 📝 Variable Naming Note

The security document uses `AT_USERNAME` and `AT_API_KEY`, but the code uses `AFRICASTALKING_USERNAME` and `AFRICASTALKING_API_KEY`. This is intentional for clarity in the codebase. Both refer to the same Africa's Talking credentials.

## 🔐 If Secrets Were Exposed

1. **Immediately rotate credentials** in provider dashboards:
   - Supabase: Regenerate API keys
   - Africa's Talking: Regenerate API key
   - Database: Change database password

2. **Update environment variables** with new credentials

3. **Remove old credentials** from code and git history

4. **Check logs, build artifacts, screenshots** for additional exposure

5. **Never paste replacement credentials** in chat or public trackers

## 📋 Git Ignore Rules

```
# Environment files with secrets
.env
.env.local
.env.*.local
!.env.example
!.env.production.example

# Admin setup script
scripts/setup-admin.js

# Credentials note file
CREDENTIALS_NOTE.txt
```

## ✅ Current Status

- ✅ Environment files properly gitignored
- ✅ Example files contain only placeholders
- ✅ No secrets in committed code
- ✅ Frontend uses only public Supabase credentials
- ✅ Backend keeps privileged credentials server-side
- ✅ Database credentials in environment variables only
- ✅ Africa's Talking API key server-side only
- ✅ OTP HMAC secret server-side only

## 🎯 Best Practices

1. **Never commit** real `.env` files
2. **Never hardcode** secrets in source code
3. **Never use** `VITE_` prefix for secrets
4. **Always use** environment variables for secrets
5. **Always enable** RLS on Supabase tables
6. **Always verify** authentication on server
7. **Always rotate** exposed credentials immediately
8. **Never share** credentials in documentation or chat