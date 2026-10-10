# SCCPMS API Documentation

This document provides API endpoint documentation for the SCCPMS (Smart Campus Clinic Patient Management System).

## Base URL

**Development**: `http://localhost:4000`
**Production**: `https://api.your-domain.com`

## Authentication

All API endpoints (except health checks) require authentication via JWT token from Supabase Auth.

**Headers**:
```
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

## Response Format

**Success Response**:
```json
{
  "data": { ... }
}
```

**Error Response**:
```json
{
  "error": "Error message"
}
```

## Health & Monitoring

### GET /healthz
Health check endpoint.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET /metrics
Detailed system metrics.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": "1h 30m",
  "database": {
    "connected": true,
    "current_time": "2024-01-01T00:00:00.000Z"
  },
  "environment": "production"
}
```

## Authentication

### POST /auth/otp/send
Send OTP verification code to user's phone.

**Request Body**:
```json
{}
```

**Response**:
```json
{
  "message": "OTP sent successfully"
}
```

### POST /auth/otp/verify
Verify OTP code.

**Request Body**:
```json
{
  "code": "123456"
}
```

**Response**:
```json
{
  "message": "OTP verified successfully"
}
```

## Profile Management

### GET /api/profile
Get current user profile.

**Response**:
```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "patient",
    "phone": "+27123456789"
  }
}
```

### PATCH /api/profile
Update user profile.

**Request Body**:
```json
{
  "full_name": "John Updated",
  "address_line1": "123 Main St",
  "city": "Johannesburg",
  "province": "Gauteng",
  "postal_code": "2000"
}
```

## Patient Management

### GET /api/patients
List all patients (admin/receptionist only).

**Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "email": "patient@example.com",
      "full_name": "Jane Doe",
      "phone": "+27123456789",
      "user_type": "Student",
      "student_number": "20240001",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### POST /api/patients
Register new patient (admin/receptionist only).

**Request Body**:
```json
{
  "email": "newpatient@example.com",
  "fullName": "New Patient",
  "phone": "+27123456789",
  "userType": "Student",
  "studentNumber": "20240002",
  "department": "Computer Science",
  "program": "BSc Computer Science"
}
```

## Doctor Management

### GET /api/doctors
List all active doctors.

**Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "full_name": "Dr. Smith",
      "specialty": "General Practice",
      "department": "Campus Clinic"
    }
  ]
}
```

### POST /api/doctors
Add new doctor (admin only).

**Request Body**:
```json
{
  "userId": "uuid",
  "fullName": "Dr. New Doctor",
  "specialty": "Cardiology",
  "department": "Campus Clinic"
}
```

### POST /api/staff
Invite new staff member (admin only).

**Request Body**:
```json
{
  "email": "staff@example.com",
  "role": "doctor",
  "fullName": "Dr. Staff",
  "phone": "+27123456789",
  "department": "Campus Clinic",
  "specialty": "General Practice"
}
```

## Appointments

### GET /api/appointments
List appointments (filtered by user role).

**Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "patient_user_id": "uuid",
      "patient_name": "Jane Doe",
      "doctor_id": "uuid",
      "doctor_name": "Dr. Smith",
      "specialty": "General Practice",
      "consultation_type": "General Consultation",
      "starts_at": "2024-01-01T09:00:00.000Z",
      "mode": "in_person",
      "status": "confirmed"
    }
  ]
}
```

### POST /api/appointments
Book new appointment (patients only).

**Request Body**:
```json
{
  "slotId": "uuid",
  "consultationType": "General Consultation",
  "mode": "in_person",
  "reason": "Routine checkup"
}
```

### PATCH /api/appointments/:id/status
Update appointment status.

**Request Body**:
```json
{
  "status": "confirmed"
}
```

**Valid Status Transitions**:
- Patients: `pending` → `cancelled`
- Doctors: `confirmed` → `in_progress` → `completed` | `no_show`
- Admin/Receptionist: All transitions

## Scheduling

### GET /api/doctors/:id/availability
Get doctor's available time slots.

**Query Parameters**:
- `date` (required): Date in YYYY-MM-DD format

**Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "doctor_id": "uuid",
      "starts_at": "2024-01-01T09:00:00.000Z",
      "ends_at": "2024-01-01T09:30:00.000Z"
    }
  ]
}
```

### POST /api/availability-slots
Add availability slot (admin/receptionist/doctor).

**Request Body**:
```json
{
  "doctorId": "uuid",
  "startsAt": "2024-01-01T09:00:00.000Z",
  "endsAt": "2024-01-01T09:30:00.000Z"
}
```

### GET /api/clinic/settings
Get clinic settings (admin/receptionist/doctor).

**Response**:
```json
{
  "data": {
    "timezone": "Africa/Johannesburg",
    "opens_at": "08:00",
    "closes_at": "17:15",
    "default_appointment_minutes": 30,
    "minimum_reschedule_notice_hours": 24
  }
}
```

### PUT /api/clinic/settings
Update clinic settings (admin only).

**Request Body**:
```json
{
  "timezone": "Africa/Johannesburg",
  "opensAt": "08:00",
  "closesAt": "17:15",
  "defaultAppointmentMinutes": 30,
  "minimumRescheduleNoticeHours": 24
}
```

### POST /api/appointments/:id/reschedule
Reschedule appointment.

**Request Body**:
```json
{
  "slotId": "uuid"
}
```

## Clinical Workflows

### POST /api/patient-visits
Record clinical visit (doctor only).

**Request Body**:
```json
{
  "appointmentId": "uuid",
  "chiefComplaint": "Patient reports headache",
  "history": "No significant medical history",
  "examination": "Normal examination",
  "assessment": "Tension headache",
  "plan": "Rest and pain management",
  "temperatureC": 37.0,
  "bloodPressureSystolic": 120,
  "bloodPressureDiastolic": 80,
  "heartRate": 72,
  "respiratoryRate": 16,
  "oxygenSaturation": 98,
  "weightKg": 70
}
```

### GET /api/patient-visits
List patient visits (filtered by user role).

**Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "appointment_id": "uuid",
      "visit_date": "2024-01-01T09:00:00.000Z",
      "chief_complaint": "Patient reports headache",
      "assessment": "Tension headache",
      "plan": "Rest and pain management",
      "temperature_c": 37.0,
      "blood_pressure_systolic": 120,
      "blood_pressure_diastolic": 80
    }
  ]
}
```

### POST /api/prescriptions
Add prescription (doctor only).

**Request Body**:
```json
{
  "visitId": "uuid",
  "medication": "Paracetamol",
  "dosage": "500mg",
  "route": "Oral",
  "frequency": "3 times daily",
  "duration": "7 days",
  "quantity": "21 tablets",
  "instructions": "Take with food"
}
```

### GET /api/prescriptions
List prescriptions (filtered by user role).

### POST /api/lab-orders
Order laboratory test (doctor only).

**Request Body**:
```json
{
  "visitId": "uuid",
  "testName": "Complete Blood Count",
  "clinicalIndication": "Routine checkup"
}
```

### GET /api/lab-orders
List lab orders (filtered by user role).

### PATCH /api/lab-orders/:id
Update lab result (doctor only).

**Request Body**:
```json
{
  "status": "resulted",
  "resultSummary": "All values within normal range"
}
```

## Walk-in Management

### GET /api/walk-ins
List walk-in queue (admin/receptionist/doctor).

**Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "patient_name": "John Doe",
      "contact_phone": "+27123456789",
      "reason": "Severe chest pain",
      "urgency": "emergency",
      "status": "waiting",
      "arrived_at": "2024-01-01T09:00:00.000Z"
    }
  ]
}
```

### POST /api/walk-ins
Check in walk-in patient (admin/receptionist).

**Request Body**:
```json
{
  "patientUserId": "uuid",
  "patientName": "John Doe",
  "contactPhone": "+27123456789",
  "reason": "Severe chest pain",
  "urgency": "emergency"
}
```

### PATCH /api/walk-ins/:id
Update walk-in status.

**Request Body**:
```json
{
  "status": "triaged",
  "urgency": "high",
  "doctorId": "uuid"
}
```

## Leave Management

### GET /api/leave-requests
List leave requests (doctor/admin/receptionist).

### POST /api/leave-requests
Submit leave request (doctor only).

**Request Body**:
```json
{
  "startsOn": "2024-01-01",
  "endsOn": "2024-01-05",
  "leaveType": "annual",
  "reason": "Family vacation"
}
```

### PATCH /api/leave-requests/:id
Approve/reject leave request (admin only).

**Request Body**:
```json
{
  "status": "approved",
  "reviewNote": "Approved as requested"
}
```

## Notifications

### GET /api/notifications
List user notifications.

**Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Appointment confirmed",
      "message": "Your appointment with Dr. Smith is confirmed",
      "category": "appointment",
      "read_at": null,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### PATCH /api/notifications/:id/read
Mark notification as read.

### POST /api/notifications/read-all
Mark all notifications as read.

## Audit & Reporting

### GET /api/audit-events
List audit events (admin only).

**Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "actor_user_id": "uuid",
      "action": "appointment.created",
      "entity_type": "appointment",
      "entity_id": "uuid",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### GET /api/reports/summary
Generate operational report (admin only).

**Query Parameters**:
- `from` (optional): Start date in YYYY-MM-DD format
- `to` (optional): End date in YYYY-MM-DD format

**Response**:
```json
{
  "data": {
    "appointments": 150,
    "completed": 120,
    "cancelled": 20,
    "no_show": 10
  }
}
```

## Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 415 | Unsupported Media Type |
| 422 | Unprocessable Entity |
| 428 | Precondition Required (OTP verification) |
| 503 | Service Unavailable |

## Rate Limiting

- **General API**: 100 requests per 15 minutes
- **Strict Endpoints** (patients, staff): 20 requests per 15 minutes
- **OTP Endpoint**: 10 requests per 15 minutes

## Status Codes

**Appointment Statuses**:
- `pending` - Appointment requested, awaiting confirmation
- `confirmed` - Appointment confirmed by staff
- `in_progress` - Appointment currently in progress
- `completed` - Appointment completed
- `cancelled` - Appointment cancelled
- `no_show` - Patient did not attend

**Lab Order Statuses**:
- `ordered` - Lab test ordered
- `collected` - Sample collected
- `processing` - Sample being processed
- `resulted` - Results available
- `cancelled` - Lab test cancelled

**Leave Request Statuses**:
- `pending` - Awaiting approval
- `approved` - Leave approved
- `rejected` - Leave rejected
- `cancelled` - Leave request cancelled

**Walk-in Statuses**:
- `waiting` - Patient waiting
- `triaged` - Patient triaged
- `assigned` - Doctor assigned
- `in_progress` - Being treated
- `completed` - Treatment completed
- `cancelled` - Walk-in cancelled

## Role-Based Access

| Endpoint | Admin | Doctor | Patient | Receptionist |
|----------|-------|--------|---------|--------------|
| /api/patients | ✓ | ✗ | ✗ | ✓ |
| /api/doctors | ✓ | ✗ | ✓ | ✗ |
| /api/staff | ✓ | ✗ | ✗ | ✗ |
| /api/appointments | ✓ | (own) | (own) | ✓ |
| /api/availability-slots | ✓ | (own) | ✗ | ✓ |
| /api/clinic/settings | ✓ | ✓ | ✗ | ✓ |
| /api/patient-visits | ✗ | (own) | (own) | ✗ |
| /api/prescriptions | ✗ | (own) | (own) | ✗ |
| /api/lab-orders | ✗ | (own) | (own) | ✗ |
| /api/walk-ins | ✓ | (assigned) | ✗ | ✓ |
| /api/leave-requests | ✓ | (own) | ✗ | ✓ |
| /api/audit-events | ✓ | ✗ | ✗ | ✗ |
| /api/reports/summary | ✓ | ✗ | ✗ | ✗ |

## Data Validation

**Phone Numbers**: Must be in international format: `+27123456789`

**Email Addresses**: Standard email format validation

**Dates**: ISO 8601 format: `2024-01-01T00:00:00.000Z`

**UUIDs**: Standard UUID v4 format

## Version

Current API Version: 1.0.0

## Changelog

### v1.0.0 (2024-01-01)
- Initial API release
- Core appointment management
- Clinical workflows
- Authentication and authorization
- Audit logging