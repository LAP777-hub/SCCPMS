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
## Team Members and Responsibilities

| Team Member | Role | Responsibilities |
|---|---|---|
| Lucky Albert Pinga | Backend Developer | Supabase database, authentication, and backend functionality. |
| Lucky Malegole Siloane | Frontend Developer | User interface, responsive design, and frontend integration. |
| Lungelo Mjuleka | Tester | System testing, bug reporting, and quality assurance. |
| Katleho Pitikoe | System Architect & Documentation | System requirements, architecture, technical specifications, and documentation. |

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

---

## Live Prototype

| Detail | Information |
|---|---|
| Live Demo | Coming Soon |
| Repository | https://github.com/LAP777-hub/SCCPMS |

---

## Architecture Overview

SCCPMS is a decoupled full-stack application:

| Layer | Description |
|---|---|
| Frontend | A React + TypeScript single-page application that consumes the backend REST API. |
| Backend | A Django REST Framework API providing authentication, business logic, and real-time features. |
| Database | PostgreSQL (Neon-hosted in production, local Postgres in development). |
| Task Queue | Celery workers backed by Redis for background and scheduled jobs. |
| Real-Time | Django Channels for WebSocket-based live updates. |
| File Storage | MinIO for object storage of uploaded documents and media. |

---

## How to Run / How to Test

### Step 1: Clone the Repository

```bash
git clone https://github.com/LAP777-hub/SCCPMS.git
cd SCCPMS
```

### Step 2: Backend Setup

**Create a virtual environment**

Windows
```bash
cd backend
python -m venv venv
venv\Scripts\activate
```

Linux / macOS
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

**Install dependencies**

```bash
pip install -r requirements.txt
```

**Configure environment variables**

Create a `.env` file in `backend/` with values for the database connection, JWT secrets, Redis URL, MinIO credentials, and Gmail SMTP settings.

**Run database migrations**

```bash
python manage.py makemigrations
python manage.py migrate
```

**Create an administrator account**

```bash
python manage.py createsuperuser
```

**Start Redis** (required for Celery and Channels)

```bash
redis-server
```

**Start the Celery worker**

```bash
celery -A sccpms worker -l info
```

**Start the Django development server**

```bash
python manage.py runserver
```

Backend API: `http://127.0.0.1:8000/`
Admin Panel: `http://127.0.0.1:8000/admin/`

### Step 3: Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend App: `http://localhost:5173/`

### Step 4 (Optional): Run with Docker

```bash
docker-compose up --build
```

This spins up the backend, frontend, PostgreSQL, Redis, and MinIO as containerized services behind Nginx.

---

## Intended Users

> SCCPMS is an internal platform developed exclusively for the Sol Plaatje University community. External users cannot register or access the system.

| User Type | Purpose |
|---|---|
| Students | Participate in university and club projects, manage assigned tasks, upload documents, collaborate with teams, and monitor project progress. |
| Lecturers | Create and supervise projects, assign work, monitor student performance, and approve submissions. |
| Heads of Department (HODs) | Oversee departmental projects, approve initiatives, monitor departmental activities, and generate reports. |
| Registrars | Manage institutional records, oversee academic project documentation, and monitor university-wide activities. |
| Administrative Staff | Coordinate projects, manage resources, communicate announcements, and oversee operational workflows. |
| Club Leaders | Manage club activities, member participation, events, and club-level projects. |
| System Administrator | Manage users, permissions, departments, security, reports, backups, and system configurations. |

---

## Key Features

| Feature | Description |
|---|---|
| SPU Authentication | Secure JWT-based login with role-based access control. |
| User Management | Manage students, lecturers, HODs, registrars, administrators, and club leaders. |
| Project Management | Create, organize, supervise, and monitor university and club projects. |
| Task Management | Assign tasks, monitor progress, and track completion with sortable, filterable tables. |
| Document Repository | Upload, organize, and securely share project documents via object storage. |
| PDF Generation | Automatically generate reports, certificates, and summaries as PDFs. |
| Calendar & Deadlines | Track project timelines, milestones, meetings, and submission dates. |
| Real-Time Collaboration | Live updates and messaging between project members over WebSockets. |
| Dashboard & Analytics | Personalized dashboards with charts and progress indicators. |
| Notifications | In-app and email updates for tasks, deadlines, approvals, and announcements. |
| Reports | Generate project performance and participation reports. |

---

## Access Control

SCCPMS is **not a public platform**. Only authenticated members of the Sol Plaatje University community are permitted access.

The system is designed to support:

| Supported Roles |
|---|
| Students |
| Lecturers |
| Heads of Department |
| Registrars |
| Administrative Staff |
| Club Leaders |
| Faculty Personnel |
| University Management |
| System Administrators |

Any attempt by external users to register or gain access is denied by the authentication system.

---

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| React | UI library for building the single-page application |
| TypeScript | Type-safe application development |
| React Router | Client-side routing and navigation |
| Tailwind CSS | Utility-first styling |
| shadcn/ui | Accessible, pre-built UI components |
| TanStack Table | Sortable, filterable data tables |
| Recharts | Dashboard charts and data visualizations |
| Lucide React | Icon set |

### Backend

| Technology | Purpose |
|---|---|
| Python | Core backend language |
| Django | Web application framework |
| Django REST Framework (DRF) | REST API layer |
| SimpleJWT | JWT-based authentication |
| Django Channels | Real-time, WebSocket-based communication |
| Celery | Background and scheduled task processing |
| Redis | Celery message broker and caching layer |

### Database

| Technology | Purpose |
|---|---|
| PostgreSQL | Primary relational database |
| Neon PostgreSQL | Cloud-hosted production database |

### File Storage & Document Generation

| Technology | Purpose |
|---|---|
| MinIO | Object storage for uploaded files and documents |
| ReportLab | Server-side PDF generation |

### Authentication & Communication

| Technology | Purpose |
|---|---|
| JWT Authentication (SimpleJWT) | Secure, stateless user authentication |
| Gmail SMTP | Email verification, password resets, and notifications |

### Hosting & Deployment

| Layer | Platform |
|---|---|
| Frontend | Vercel |
| Backend | Railway or Render |

### Development Tools

| Tool | Purpose |
|---|---|
| Git | Version control |
| GitHub | Source hosting and collaboration |
| Node.js | JavaScript runtime for frontend tooling |
| npm | Frontend package management |
| Visual Studio Code | Development environment |
| Postman | API testing and debugging |

### Optional Infrastructure

| Technology | Purpose |
|---|---|
| Docker | Containerized local and production environments |
| Nginx | Reverse proxy and static file serving |

### Testing

| Tool | Purpose |
|---|---|
| Pytest | Backend unit and integration testing |
| Jest | Frontend unit testing |
| React Testing Library | Frontend component testing |

### Code Quality

| Tool | Purpose |
|---|---|
| ESLint | JavaScript/TypeScript linting |
| Prettier | Code formatting |

---

## Project Structure

```text
SCCPMS/
│
├── backend/
│   ├── accounts/
│   ├── projects/
│   ├── departments/
│   ├── dashboard/
│   ├── notifications/
│   ├── clubs/
│   ├── sccpms/            # project settings, ASGI/WSGI, Celery config
│   ├── manage.py
│   ├── requirements.txt
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── routes/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── docker-compose.yml
└── README.md
```

---

## System Modules

| Module | Purpose |
|---|---|
| Authentication | Secure SPU user login via JWT |
| User Management | Manage university and club accounts and permissions |
| Departments | Organize projects by faculty and department |
| Clubs | Organize and manage student club activities and membership |
| Project Management | Create and manage institutional and club projects |
| Task Management | Assign and monitor project activities |
| Document Management | Secure file storage, sharing, and PDF generation |
| Real-Time Communication | Live messaging and updates via WebSockets |
| Notifications | In-app and email alerts and reminders |
| Reporting | Analytics and institutional reports |
| Dashboard | Personalized overview for each user |

---

## Future Enhancements

| Planned Enhancement |
|---|
| Microsoft 365 integration |
| SPU Student Portal integration |
| Single Sign-On (SSO) |
| Mobile application |
| AI-assisted project recommendations |
| Digital approvals |
| QR code attendance |
| Video conferencing integration |
| Two-Factor Authentication (2FA) |
| CI/CD pipeline with automated testing |

---


## Lessons Learned

Developing SCCPMS demonstrates how a decoupled, full-stack architecture can improve collaboration and project coordination across a university community. By separating the React frontend from the Django REST API backend, and integrating real-time communication, background task processing, and object storage, SCCPMS can scale to support both academic projects and student club activities while maintaining secure, role-based access.

Key takeaways include:

| Takeaway |
|---|
| A decoupled frontend/backend architecture improves scalability and maintainability. |
| Role-based security protects institutional information. |
| Background task queues keep the API responsive under load. |
| Real-time channels improve collaboration and engagement. |
| Automated testing and linting improve long-term code quality. |

---

## Important Note

SCCPMS is developed specifically for **Sol Plaatje University** and is intended for use **only by authorized members of the university community**. It is not designed for public access or external organizations.

---

## References

| Resource | Link |
|---|---|
| React Documentation | https://react.dev/ |
| Django Documentation | https://docs.djangoproject.com/ |
| Django REST Framework | https://www.django-rest-framework.org/ |
| Django Channels | https://channels.readthedocs.io/ |
| Celery Documentation | https://docs.celeryq.dev/ |
| Tailwind CSS | https://tailwindcss.com/ |
| shadcn/ui | https://ui.shadcn.com/ |
| MinIO Documentation | https://min.io/docs/ |

---

## License

This project is licensed under the MIT License.

---

*"Connecting the Sol Plaatje University community through secure collaboration and effective project management."*
