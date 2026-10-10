# SCCPMS - Smart Campus Clinic Patient Management System

A comprehensive clinic management system designed for university campus environments with role-based access control, appointment scheduling, clinical records, and administrative workflows.

## 🏥 Features

### Patient Features
- Book appointments with available doctors
- View appointment history and status updates
- Cancel and reschedule appointments
- Access health records (visits, prescriptions, lab results)
- Profile management with university identity verification
- Real-time notification system

### Doctor Features
- View and manage assigned appointments
- Conduct clinical visits with SOAP notes and vitals
- Prescribe medications
- Order laboratory tests and manage results
- Manage availability slots
- Submit and track leave requests
- Comprehensive clinical documentation workflow

### Admin Features
- User management (invite doctors, receptionists, register patients)
- Doctor directory management
- Clinic settings configuration (hours, timezone, booking policies)
- Appointment oversight and management
- Leave request approval workflow
- Comprehensive audit log access
- Operational reports and analytics

### Receptionist Features
- Patient registration and intake
- Walk-in queue management
- Appointment scheduling assistance
- Front desk operations

## 🏗️ Architecture

### Technology Stack

**Frontend:**
- React 18.3.1 with TypeScript
- Vite 5.4.2 (build tool)
- Tailwind CSS 3.4.1 (styling)
- Supabase JS 2.57.4 (authentication)
- Lucide React 0.446.0 (icons)

**Backend:**
- Node.js/Express 5.1.0 API server
- PostgreSQL (via pg 8.13.0)
- Supabase (authentication & profiles)
- Zod 3.23.8 (validation)
- Helmet 8.1.0 (security headers)
- Express Rate Limiting 7.5.0

**Infrastructure:**
- Supabase Auth (user authentication)
- PostgreSQL database (clinical data)
- Africa's Talking SMS integration (OTP verification)

### Project Structure

```
project/
├── src/                      # Frontend React application
│   ├── components/          # React components
│   │   ├── PatientDashboard.tsx
│   │   ├── DoctorDashboard.tsx
│   │   ├── AdminDashboard.tsx
│   │   └── ReceptionistDashboard.tsx
│   ├── lib/                # Shared utilities
│   │   ├── AuthContext.tsx
│   │   ├── api.ts
│   │   └── supabase.ts
│   ├── App.tsx             # Main application component
│   └── main.tsx            # Application entry point
├── server/                 # Backend API server
│   ├── src/
│   │   ├── index.ts        # Server entry point
│   │   ├── api.routes.ts   # Core API endpoints
│   │   ├── clinical.routes.ts  # Clinical workflows
│   │   ├── scheduling.routes.ts # Scheduling endpoints
│   │   ├── otp.routes.ts   # OTP verification
│   │   ├── auth.ts         # Authentication middleware
│   │   ├── db.ts           # Database connection
│   │   └── config.ts       # Configuration management
│   ├── sql/                # Database migrations
│   │   ├── 001_initial.sql
│   │   ├── 002_notifications_audit.sql
│   │   └── 003_clinic_workflows.sql
│   ├── scripts/            # Utility scripts
│   │   └── migrate.ts      # Database migration runner
│   └── tests/              # Backend tests
├── supabase/              # Supabase configuration
│   ├── migrations/        # Supabase migrations
│   └── functions/         # Supabase edge functions
└── public/               # Static assets
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Supabase account
- Africa's Talking account (for SMS OTP)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd project
```

2. **Install frontend dependencies**
```bash
npm install
```

3. **Install backend dependencies**
```bash
cd server
npm install
```

4. **Configure environment variables**

Create `.env` file in the project root:
```env
# Frontend
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_URL=http://localhost:4000
```

Create `.env` file in the server directory:
```env
NODE_ENV=development
PORT=4000
FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://user:password@localhost:5432/sccpms
DATABASE_SSL_MODE=disable
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OTP_HMAC_SECRET=your-32-character-hmac-secret
AFRICASTALKING_USERNAME=your-username
AFRICASTALKING_API_KEY=your-api-key
AFRICASTALKING_SENDER_ID=your-sender-id
```

5. **Run database migrations**
```bash
cd server
npm run db:migrate
```

6. **Start the development servers**

Frontend (in project root):
```bash
npm run dev
```

Backend (in server directory):
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173` and the backend at `http://localhost:4000`.

## 🗄️ Database Schema

### Core Tables

- **profiles** - User accounts with roles (admin, doctor, patient, receptionist, student, lecturer, staff)
- **clinic_doctors** - Doctor directory with specialties
- **appointments** - Appointment bookings with status workflow
- **doctor_availability_slots** - Bookable time slots
- **patient_visits** - Clinical encounter records (vitals, complaints, assessment, plan)
- **prescriptions** - Medication orders linked to visits
- **lab_orders** - Laboratory test orders with results
- **walk_ins** - Walk-in patient queue management
- **doctor_leave_requests** - Leave approval workflow
- **notifications** - User notifications system
- **audit_events** - Comprehensive audit logging
- **clinic_settings** - Clinic hours, timezone, booking policies
- **clinic_holidays** - Holiday schedule management

## 🔐 Security

- **Two-Factor Authentication**: SMS-based OTP verification via Africa's Talking
- **Role-Based Access Control**: Granular permissions by user role
- **Audit Logging**: All actions tracked with actor, action, entity type, and timestamp
- **Row-Level Security**: Supabase RLS policies on profile data
- **Input Validation**: Zod schemas on all API endpoints
- **Rate Limiting**: OTP endpoint protected (10 requests per 15 minutes)
- **Security Headers**: Helmet middleware for Express
- **Database Constraints**: PostgreSQL checks and exclusion constraints

## 📡 API Endpoints

For complete API documentation with request/response schemas, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) or [openapi.yaml](./openapi.yaml).

### Authentication
- `POST /auth/otp/send` - Send OTP code
- `POST /auth/otp/verify` - Verify OTP code

### Core API
- `GET /api/profile` - Get user profile
- `PATCH /api/profile` - Update profile
- `GET /api/patients` - List patients (admin/receptionist)
- `POST /api/patients` - Register patient (admin/receptionist)
- `GET /api/doctors` - List doctors
- `POST /api/doctors` - Add doctor (admin)
- `POST /api/staff` - Invite staff (admin)
- `GET /api/appointments` - List appointments
- `POST /api/appointments` - Book appointment
- `PATCH /api/appointments/:id/status` - Update appointment status
- `GET /api/notifications` - List notifications
- `PATCH /api/notifications/:id/read` - Mark notification read
- `POST /api/notifications/read-all` - Mark all notifications read
- `GET /api/audit-events` - Audit log (admin)

### Scheduling
- `GET /api/doctors/:id/availability` - Get doctor availability
- `POST /api/availability-slots` - Add availability slot
- `GET /api/clinic/settings` - Get clinic settings
- `PUT /api/clinic/settings` - Update clinic settings
- `POST /api/appointments/:id/reschedule` - Reschedule appointment

### Clinical
- `POST /api/patient-visits` - Record clinical visit
- `GET /api/patient-visits` - List visits
- `POST /api/prescriptions` - Add prescription
- `GET /api/prescriptions` - List prescriptions
- `POST /api/lab-orders` - Order lab test
- `GET /api/lab-orders` - List lab orders
- `PATCH /api/lab-orders/:id` - Update lab result
- `GET /api/walk-ins` - List walk-in queue
- `POST /api/walk-ins` - Check in walk-in
- `PATCH /api/walk-ins/:id` - Update walk-in status
- `GET /api/leave-requests` - List leave requests
- `POST /api/leave-requests` - Submit leave request
- `PATCH /api/leave-requests/:id` - Approve/reject leave
- `GET /api/reports/summary` - Operational report

## 🧪 Testing

### Run Tests

```bash
cd server
npm test
```

### Type Checking

```bash
# Frontend
npm run typecheck

# Backend
cd server
npm run typecheck
```

## 🏗️ Building for Production

### Frontend
```bash
npm run build
```

### Backend
```bash
cd server
npm run build
npm start
```

## 🐳 Docker Deployment

### Build and Run with Docker Compose

```bash
docker-compose up -d
```

### Individual Container Build

```bash
# Frontend
docker build -t sccpms-frontend .

# Backend
cd server
docker build -t sccpms-backend .
```

## 📦 Deployment

### Environment Setup

1. **Production Environment Variables**
   - Set `NODE_ENV=production`
   - Configure production database URL
   - Use production Supabase credentials
   - Enable SSL mode for database connections

2. **Database Setup**
   - Run migrations: `npm run db:migrate`
   - Create admin user via Supabase dashboard
   - Configure clinic settings via API

3. **Build Applications**
   - Build frontend: `npm run build`
   - Build backend: `npm run build`

4. **Deploy**
   - Frontend: Deploy `dist/` to static hosting (Vercel, Netlify, etc.)
   - Backend: Deploy to Node.js hosting (Railway, Render, AWS, etc.)

## 🔧 Troubleshooting

### Common Issues

**Database Connection Failed**
- Verify DATABASE_URL is correct
- Check PostgreSQL is running
- Ensure database exists and migrations are run

**OTP Not Sending**
- Verify Africa's Talking credentials
- Check phone number format (international format)
- Ensure OTP_HMAC_SECRET is set

**Supabase Auth Issues**
- Verify SUPABASE_URL and keys are correct
- Check user exists in profiles table
- Ensure RLS policies are configured

**CORS Errors**
- Verify FRONTEND_ORIGIN matches your frontend URL
- Check CORS configuration in server/src/index.ts

## 📝 Development Guidelines

### Code Style
- Use TypeScript for type safety
- Follow existing component patterns
- Use Zod for input validation
- Implement proper error handling
- Add comments for complex logic

### Database Changes
- Create new migration files in `server/sql/`
- Use transaction blocks for multi-table changes
- Test migrations in development first
- Document schema changes in migration comments

### API Development
- Add Zod validation schemas
- Implement proper error responses
- Add audit logging for sensitive operations
- Update API documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and type checking
5. Submit a pull request

## 📄 License

[Specify your license here]

## 🆘 Support

For issues and questions:
- Create an issue in the repository
- Contact: [your contact information]
- Documentation: [link to documentation]

## 🗺️ Roadmap

- [ ] Enhanced mobile app
- [ ] Telehealth video integration
- [ ] Advanced reporting and analytics
- [ ] Integration with external EMR systems
- [ ] Patient portal enhancements
- [ ] Automated appointment reminders
- [ ] Billing and insurance integration
