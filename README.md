# SCCPMS — Sol Plaatje University Community Project Management System

**Sol Plaatje University** | *Internal Community Collaboration & Project Management Platform*

---

## One-Sentence Summary

> *"SCCPMS is a secure web-based platform developed exclusively for the Sol Plaatje University community, enabling students, lecturers, HODs, registrars, administrative staff, and other university personnel to collaborate on projects, manage tasks, share resources, and streamline communication within a single centralized system."*

---

## Live Prototype

| Detail | Information |
|---|---|
| Live Demo | Coming Soon |
| Repository | https://github.com/LAP777-hub/SCCPMS |

---

## How to Run / How to Test

### Step 1: Clone the Repository

```bash
git clone https://github.com/LAP777-hub/SCCPMS.git
cd SCCPMS
```

### Step 2: Create a Virtual Environment

**Windows**

```bash
python -m venv venv
venv\Scripts\activate
```

**Linux / macOS**

```bash
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 4: Configure the Database

```bash
python manage.py makemigrations
python manage.py migrate
```

### Step 5: Create an Administrator Account

```bash
python manage.py createsuperuser
```

### Step 6: Start the Server

```bash
python manage.py runserver
```

Visit: `http://127.0.0.1:8000/`

Administrator Panel: `http://127.0.0.1:8000/admin/`

---

## Intended Users

> SCCPMS is an internal platform developed exclusively for the Sol Plaatje University community. External users cannot register or access the system.

| User Type | Purpose |
|---|---|
| Students | Participate in university projects, manage assigned tasks, upload documents, collaborate with teams, and monitor project progress. |
| Lecturers | Create and supervise projects, assign work, monitor student performance, and approve submissions. |
| Heads of Department (HODs) | Oversee departmental projects, approve initiatives, monitor departmental activities, and generate reports. |
| Registrars | Manage institutional records, oversee academic project documentation, and monitor university-wide activities. |
| Administrative Staff | Coordinate projects, manage resources, communicate announcements, and oversee operational workflows. |
| System Administrator | Manage users, permissions, departments, security, reports, backups, and system configurations. |

---

## Key Features

| Feature | Description |
|---|---|
| SPU Authentication | Secure login using university credentials with role-based access control. |
| User Management | Manage students, lecturers, HODs, registrars, administrators, and university staff. |
| Project Management | Create, organize, supervise, and monitor university projects. |
| Task Management | Assign tasks, monitor progress, and track completion. |
| Document Repository | Upload, organize, and securely share project documents. |
| Calendar & Deadlines | Track project timelines, milestones, meetings, and submission dates. |
| Collaboration | Internal communication between project members. |
| Dashboard | Personalized dashboards with project statistics and progress indicators. |
| Notifications | Receive updates for tasks, deadlines, approvals, and announcements. |
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
| Faculty Personnel |
| University Management |
| System Administrators |

Any attempt by external users to register or gain access is denied by the authentication system.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| Python | Backend Development |
| Django | Web Framework |
| HTML5 | Frontend Structure |
| CSS3 | Styling |
| JavaScript | Client-side Logic |
| Bootstrap 5 | Responsive Interface |
| SQLite | Development Database |
| MySQL | Production Database |
| Git & GitHub | Version Control |
| Visual Studio Code | Development Environment |

---

## Project Structure

```text
SCCPMS/
│
├── accounts/
├── projects/
├── departments/
├── dashboard/
├── notifications/
├── templates/
├── static/
├── media/
├── manage.py
├── requirements.txt
├── db.sqlite3
└── README.md
```

---

## System Modules

| Module | Purpose |
|---|---|
| Authentication | Secure SPU user login |
| User Management | Manage university accounts and permissions |
| Departments | Organize projects by faculty and department |
| Project Management | Create and manage institutional projects |
| Task Management | Assign and monitor project activities |
| Document Management | Secure file storage and sharing |
| Notifications | Alerts and reminders |
| Reporting | Analytics and institutional reports |
| Dashboard | Personalized overview for each user |

---

## Future Enhancements

| Planned Enhancement |
|---|
| Microsoft 365 integration |
| SPU Student Portal integration |
| Single Sign-On (SSO) |
| Email notifications |
| Mobile application |
| AI-assisted project recommendations |
| Digital approvals |
| QR code attendance |
| Real-time messaging |
| Video conferencing integration |
| REST API |
| Two-Factor Authentication (2FA) |

---

## Developer

| Name | Role |
|---|---|
| **Lucky Pinga** | Sole Developer, System Architect, UI/UX Designer, Backend Developer, Database Designer & Project Lead |

---

## Lessons Learned

Developing SCCPMS demonstrates how a centralized digital platform can improve collaboration and project coordination across the university. By integrating project management, communication, document sharing, and reporting into a single system, Sol Plaatje University staff and students can work more efficiently while maintaining secure access through role-based permissions.

Key takeaways include:

| Takeaway |
|---|
| Centralized systems improve collaboration. |
| Role-based security protects institutional information. |
| Digital workflows increase accountability and transparency. |
| Effective project tracking improves productivity. |
| Integrated communication reduces administrative overhead. |

---

## Important Note

SCCPMS is developed specifically for **Sol Plaatje University** and is intended for use **only by authorized members of the university community**. It is not designed for public access or external organizations.

---

## References

| Resource | Link |
|---|---|
| Django Documentation | https://docs.djangoproject.com/ |
| Python Documentation | https://docs.python.org/ |
| Bootstrap Documentation | https://getbootstrap.com/ |
| MDN Web Docs | https://developer.mozilla.org/ |

---

## License

This project is licensed under the MIT License.

---

*"Connecting the Sol Plaatje University community through secure collaboration and effective project management."*
