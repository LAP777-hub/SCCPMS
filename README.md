# SCCPMS — Student Community & Club Project Management System

**Sol Plaatje University** | *Internal Community & Club Collaboration Platform*

---

## One-Sentence Summary

> *"SCCPMS is a secure full-stack platform developed exclusively for the Sol Plaatje University community, enabling students, lecturers, HODs, registrars, administrative staff, and club leaders to collaborate on projects, manage tasks, share resources, and streamline communication within a single centralized system."*

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

## Developer

| Name | Role |
|---|---|
| **Lucky Pinga** | Sole Developer, System Architect, UI/UX Designer, Full-Stack Developer, Database Designer & Project Lead |

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
