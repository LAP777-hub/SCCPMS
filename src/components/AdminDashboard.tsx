import { useEffect, useState, type FormEvent } from 'react';
import {
  Activity, Bell, Calendar, CalendarCheck, FileText, LayoutDashboard,
  LogOut, Menu, Plus, ShieldCheck, Stethoscope, Users, X,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { apiRequest } from '../lib/api';
import StaffRegistrationModal from './admin/StaffRegistrationModal';

type AdminSection = 'overview' | 'doctors' | 'patients' | 'appointments' | 'schedule' | 'reports' | 'leave' | 'logs';
type Doctor = { id: string; user_id: string; full_name: string; specialty: string; department: string | null; active: boolean };
type Patient = { id: string; email: string; full_name: string | null; phone: string | null; user_type: string | null; student_number: string | null; staff_number: string | null; department: string | null; program: string | null; created_at: string };
type Appointment = { id: string; patient_user_id: string; patient_name: string; doctor_name: string; specialty: string; consultation_type: string; starts_at: string; mode: string; status: string };
type AuditEvent = { id: string; actor_user_id: string; action: string; entity_type: string; entity_id: string | null; created_at: string };
type LeaveRequest = { id: string; doctor_user_id: string; starts_on: string; ends_on: string; leave_type: string; reason: string; status: string; review_note: string | null };
type AdminData = { doctors: Doctor[]; patients: Patient[]; appointments: Appointment[]; auditEvents: AuditEvent[]; leaveRequests: LeaveRequest[] };

const navItems: { id: AdminSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'doctors', label: 'Doctors', icon: Stethoscope },
  { id: 'patients', label: 'Patients', icon: Users },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'schedule', label: 'Doctor Availability', icon: Calendar },
  { id: 'reports', label: 'Reports', icon: Activity },
  { id: 'leave', label: 'Leave Requests', icon: Calendar },
  { id: 'logs', label: 'Audit Log', icon: FileText },
];

async function loadAdminData(): Promise<AdminData> {
  const [doctors, patients, appointments, auditEvents, leaveRequests] = await Promise.all([
    apiRequest<{ data: Doctor[] }>('/api/doctors'),
    apiRequest<{ data: Patient[] }>('/api/patients'),
    apiRequest<{ data: Appointment[] }>('/api/appointments'),
    apiRequest<{ data: AuditEvent[] }>('/api/audit-events'),
    apiRequest<{ data: LeaveRequest[] }>('/api/leave-requests'),
  ]);
  return { doctors: doctors.data, patients: patients.data, appointments: appointments.data, auditEvents: auditEvents.data, leaveRequests: leaveRequests.data };
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function Empty({ children }: { children: React.ReactNode }) {
  return <tr><td colSpan={8} className="admin-empty-state">{children}</td></tr>;
}

function Table({ children }: { children: React.ReactNode }) {
  return <div className="admin-table-wrap"><table className="admin-table">{children}</table></div>;
}

function ScheduleAdminView({ doctors, onSaved }: { doctors: Doctor[]; onSaved: () => void }) {
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [slots, setSlots] = useState<Array<{ id: string; starts_at: string; ends_at: string }>>([]);
  const [hours, setHours] = useState({ timezone: 'Africa/Johannesburg', opens_at: '08:00', closes_at: '17:15', default_appointment_minutes: 30, maximum_reschedules_per_day: 2 });
  const [error, setError] = useState('');

  useEffect(() => {
    void apiRequest<{ data: typeof hours }>('/api/clinic/settings').then((result) => setHours({
      timezone: result.data.timezone,
      opens_at: String(result.data.opens_at).slice(0, 5),
      closes_at: String(result.data.closes_at).slice(0, 5),
      default_appointment_minutes: result.data.default_appointment_minutes,
      maximum_reschedules_per_day: result.data.maximum_reschedules_per_day,
    })).catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : 'Unable to load clinic settings.'));
  }, []);

  useEffect(() => {
    if (!doctorId || !date) return;
    let active = true;
    apiRequest<{ data: typeof slots }>(`/api/doctors/${doctorId}/availability?date=${date}`)
      .then((result) => { if (active) setSlots(result.data); })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load availability.'); });
    return () => { active = false; };
  }, [doctorId, date]);

  async function addSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      const startsAt = new Date(`${date}T${startTime}:00`);
      const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
      await apiRequest('/api/availability-slots', { method: 'POST', body: JSON.stringify({ doctorId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }) });
      const result = await apiRequest<{ data: typeof slots }>(`/api/doctors/${doctorId}/availability?date=${date}`);
      setSlots(result.data);
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to add availability.');
    }
  }

  async function saveHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      const result = await apiRequest<{ data: typeof hours }>('/api/clinic/settings', { method: 'PUT', body: JSON.stringify({ timezone: hours.timezone, opensAt: hours.opens_at, closesAt: hours.closes_at, defaultAppointmentMinutes: hours.default_appointment_minutes, maximumReschedulesPerDay: hours.maximum_reschedules_per_day }) });
      setHours({ ...hours, ...result.data, opens_at: String(result.data.opens_at).slice(0, 5), closes_at: String(result.data.closes_at).slice(0, 5) });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save clinic settings.');
    }
  }

  return <section className="admin-section"><div className="admin-section-heading"><div><h1>Doctor Availability</h1><p>Manage clinic hours and appointment slots.</p></div></div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <form className="admin-panel" onSubmit={saveHours}><h2>Clinic booking policy</h2><div className="admin-form-row">
      <label>Timezone<input value={hours.timezone} onChange={(event) => setHours({ ...hours, timezone: event.target.value })} required /></label>
      <label>Opens at<input type="time" value={hours.opens_at} onChange={(event) => setHours({ ...hours, opens_at: event.target.value })} required /></label>
      <label>Closes at<input type="time" value={hours.closes_at} onChange={(event) => setHours({ ...hours, closes_at: event.target.value })} required /></label>
      <label>Default duration (minutes)<input type="number" min="10" max="30" value={hours.default_appointment_minutes} onChange={(event) => setHours({ ...hours, default_appointment_minutes: Number(event.target.value) })} required /></label>
      <label>Reschedules per account/day<input type="number" min="0" max="10" value={hours.maximum_reschedules_per_day} onChange={(event) => setHours({ ...hours, maximum_reschedules_per_day: Number(event.target.value) })} required /></label>
    </div><button className="admin-primary-button">Save clinic policy</button></form>
    <form className="admin-panel" onSubmit={addSlot}><h2>Add doctor slot</h2><div className="admin-form-row">
      <label>Doctor<select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required><option value="">Choose doctor</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name} · {doctor.specialty}</option>)}</select></label>
      <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
      <label>Start time<input type="time" step="1800" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
    </div><button className="admin-primary-button" type="submit" disabled={!doctorId || !date}>Add 30-minute slot</button>
      {slots.length ? <Table><thead><tr><th>Start</th><th>End</th></tr></thead><tbody>{slots.map((slot) => <tr key={slot.id}><td>{new Date(slot.starts_at).toLocaleString()}</td><td>{new Date(slot.ends_at).toLocaleTimeString()}</td></tr>)}</tbody></Table> : doctorId && date ? <p>No available slots for this date.</p> : null}
    </form>
  </section>;
}

function ReportSummary() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [summary, setSummary] = useState<{ appointments: number; completed: number; cancelled: number; no_show: number } | null>(null);
  const [error, setError] = useState('');

  async function load(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError('');
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try {
      const result = await apiRequest<{ data: typeof summary }>(`/api/reports/summary${params.size ? `?${params}` : ''}`);
      setSummary(result.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load report.');
    }
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    apiRequest<{ data: NonNullable<typeof summary> }>(`/api/reports/summary${params.size ? `?${params}` : ''}`)
      .then((result) => setSummary(result.data))
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : 'Unable to load report.'));
  }, [from, to]);

  return <div><form className="admin-panel" onSubmit={(event) => void load(event)}><div className="admin-form-row"><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div><button className="admin-primary-button">Run report</button></form>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {summary && <div className="admin-stats-grid"><div className="admin-stat-card"><span>Appointments</span><strong>{summary.appointments}</strong></div><div className="admin-stat-card"><span>Completed</span><strong>{summary.completed}</strong></div><div className="admin-stat-card"><span>Cancelled</span><strong>{summary.cancelled}</strong></div><div className="admin-stat-card"><span>No-show</span><strong>{summary.no_show}</strong></div></div>}
  </div>;
}

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const [section, setSection] = useState<AdminSection>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [staffRole, setStaffRole] = useState<'doctor' | 'receptionist'>('doctor');
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [data, setData] = useState<AdminData>({ doctors: [], patients: [], appointments: [], auditEvents: [], leaveRequests: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh() {
    try {
      setError('');
      setData(await loadAdminData());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load administration data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const changeSection = (next: AdminSection) => {
    setSection(next);
    setSidebarOpen(false);
  };
  const openStaffRegistration = (role: 'doctor' | 'receptionist') => {
    setStaffRole(role);
    setStaffModalOpen(true);
  };

  const renderDoctors = () => <section className="admin-section">
    <div className="admin-section-heading"><div><h1>Doctors</h1><p>Active practitioners in the clinic directory.</p></div><div className="admin-heading-actions">
      <button className="admin-primary-button" onClick={() => openStaffRegistration('doctor')}><Plus size={16} />Add Doctor</button>
      <button className="admin-secondary-button" onClick={() => openStaffRegistration('receptionist')}><Plus size={16} />Add Receptionist</button>
    </div></div>
    <Table><thead><tr><th>Name</th><th>Specialty</th><th>Department</th><th>Account ID</th></tr></thead><tbody>
      {data.doctors.map((doctor) => <tr key={doctor.id}><td>{doctor.full_name}</td><td>{doctor.specialty}</td><td>{doctor.department || 'Not provided'}</td><td>{doctor.id}</td></tr>)}
      {!data.doctors.length && <Empty>No doctors have been provisioned yet.</Empty>}
    </tbody></Table>
  </section>;

  const renderPatients = () => <section className="admin-section">
    <div className="admin-section-heading"><div><h1>Patients</h1><p>Patient accounts currently registered in the system.</p></div></div>
    <Table><thead><tr><th>Name</th><th>Type</th><th>Email</th><th>Phone</th><th>University ID</th><th>Department / Program</th></tr></thead><tbody>
      {data.patients.map((patient) => <tr key={patient.id}><td>{patient.full_name || 'Name not provided'}</td><td>{patient.user_type || 'Not provided'}</td><td>{patient.email}</td><td>{patient.phone || 'Not provided'}</td><td>{patient.student_number || patient.staff_number || 'Not provided'}</td><td>{patient.department || patient.program || 'Not provided'}</td></tr>)}
      {!data.patients.length && <Empty>No patient accounts have been registered.</Empty>}
    </tbody></Table>
  </section>;

  const renderAppointments = () => <section className="admin-section">
    <div className="admin-section-heading"><div><h1>Appointments</h1><p>Appointment requests and visits recorded by the clinic.</p></div></div>
    <Table><thead><tr><th>Patient</th><th>Doctor</th><th>Specialty</th><th>Consultation</th><th>Start</th><th>Mode</th><th>Status</th></tr></thead><tbody>
      {data.appointments.map((appointment) => <tr key={appointment.id}><td>{appointment.patient_name}</td><td>{appointment.doctor_name}</td><td>{appointment.specialty}</td><td>{appointment.consultation_type}</td><td>{formatDate(appointment.starts_at)}</td><td>{appointment.mode === 'in_person' ? 'In person' : 'Telehealth'}</td><td><span className={`admin-status-pill ${appointment.status.replace(/_/g, '-')}`}>{appointment.status.replace(/_/g, ' ')}</span></td></tr>)}
      {!data.appointments.length && <Empty>No appointments have been recorded.</Empty>}
    </tbody></Table>
  </section>;

  const renderLogs = () => <section className="admin-section">
    <div className="admin-section-heading"><div><h1>Audit Log</h1><p>Recorded account and appointment actions.</p></div></div>
    <Table><thead><tr><th>Time</th><th>Actor account</th><th>Action</th><th>Record type</th><th>Record ID</th></tr></thead><tbody>
      {data.auditEvents.map((event) => <tr key={event.id}><td>{formatDate(event.created_at)}</td><td>{event.actor_user_id}</td><td>{event.action}</td><td>{event.entity_type}</td><td>{event.entity_id || '—'}</td></tr>)}
      {!data.auditEvents.length && <Empty>No audit events have been recorded.</Empty>}
    </tbody></Table>
  </section>;

  async function decideLeave(id: string, status: 'approved' | 'rejected') {
    try {
      await apiRequest(`/api/leave-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update leave request.');
    }
  }

  const renderLeaveRequests = () => <section className="admin-section">
    <div className="admin-section-heading"><div><h1>Leave Requests</h1><p>Review doctor leave requests.</p></div></div>
    <Table><thead><tr><th>Doctor account</th><th>Type</th><th>Dates</th><th>Reason</th><th>Status</th><th>Decision</th></tr></thead><tbody>
      {data.leaveRequests.map((request) => <tr key={request.id}><td>{request.doctor_user_id}</td><td>{request.leave_type}</td><td>{request.starts_on} to {request.ends_on}</td><td>{request.reason}</td><td>{request.status}</td><td>{request.status === 'pending' && <><button className="admin-primary-button" onClick={() => void decideLeave(request.id, 'approved')}>Approve</button><button className="admin-secondary-button" onClick={() => void decideLeave(request.id, 'rejected')}>Reject</button></>}</td></tr>)}
      {!data.leaveRequests.length && <Empty>No leave requests have been submitted.</Empty>}
    </tbody></Table>
  </section>;

  const renderReports = () => <section className="admin-section"><div className="admin-section-heading"><div><h1>Operational Reports</h1><p>Aggregate appointment activity for the selected period.</p></div></div><ReportSummary /></section>;

  const renderOverview = () => <section className="admin-section">
    <div className="admin-section-heading"><div><h1>Clinic Overview</h1><p>Current operational records from the clinic database.</p></div></div>
    <div className="admin-stats-grid">
      <div className="admin-stat-card"><Users size={21} /><span>Patients</span><strong>{data.patients.length}</strong></div>
      <div className="admin-stat-card"><Stethoscope size={21} /><span>Doctors</span><strong>{data.doctors.length}</strong></div>
      <div className="admin-stat-card"><CalendarCheck size={21} /><span>Appointments</span><strong>{data.appointments.length}</strong></div>
      <div className="admin-stat-card"><Activity size={21} /><span>Audit events</span><strong>{data.auditEvents.length}</strong></div>
    </div>
    <div className="admin-panel"><div className="admin-panel-header"><h2><CalendarCheck size={18} />Recent Appointments</h2><button onClick={() => changeSection('appointments')}>View all</button></div>
      <Table><thead><tr><th>Doctor</th><th>Consultation</th><th>Start</th><th>Status</th></tr></thead><tbody>
        {data.appointments.slice(0, 8).map((appointment) => <tr key={appointment.id}><td>{appointment.doctor_name}</td><td>{appointment.consultation_type}</td><td>{formatDate(appointment.starts_at)}</td><td>{appointment.status.replace(/_/g, ' ')}</td></tr>)}
        {!data.appointments.length && <Empty>No appointments have been recorded.</Empty>}
      </tbody></Table>
    </div>
  </section>;

  const activeItem = navItems.find((item) => item.id === section);
  const content = section === 'overview' ? renderOverview() : section === 'doctors' ? renderDoctors() : section === 'patients' ? renderPatients() : section === 'appointments' ? renderAppointments() : section === 'schedule' ? <ScheduleAdminView doctors={data.doctors} onSaved={() => void refresh()} /> : section === 'reports' ? renderReports() : section === 'leave' ? renderLeaveRequests() : renderLogs();

  return <div className="admin-shell">
    <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="admin-sidebar-header"><span className="admin-sidebar-logo"><ShieldCheck size={25} /></span><div><strong>SCCPMS</strong><small>Administration</small></div></div>
      <nav className="admin-nav">{navItems.map((item) => <button key={item.id} className={`admin-nav-item ${section === item.id ? 'active' : ''}`} onClick={() => changeSection(item.id)}><item.icon size={20} /><span>{item.label}</span></button>)}</nav>
      <button className="admin-signout" onClick={signOut}><LogOut size={20} />Sign Out</button>
    </aside>
    {sidebarOpen && <div className="admin-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
    <div className="admin-main">
      <header className="admin-topbar"><button className="admin-menu-btn" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle menu">{sidebarOpen ? <X size={22} /> : <Menu size={22} />}</button>
        <div className="admin-topbar-title">{activeItem && <activeItem.icon size={20} />}<h2>{activeItem?.label}</h2></div>
        <div className="admin-topbar-actions"><button className="admin-icon-btn" onClick={() => changeSection('logs')} aria-label="Audit log"><Bell size={20} /></button>
          <div className="admin-user-chip"><div className="admin-user-avatar">{profile?.email?.charAt(0).toUpperCase() || 'A'}</div><div><strong>{profile?.email || 'Administrator'}</strong><small>Administrator</small></div></div>
        </div>
      </header>
      <div className="admin-content">
        {error && <div className="admin-error" role="alert">{error}<button onClick={() => void refresh()}>Retry</button></div>}
        {loading ? <div className="admin-section">Loading clinic records…</div> : content}
      </div>
    </div>
    <StaffRegistrationModal open={staffModalOpen} defaultRole={staffRole} onClose={() => { setStaffModalOpen(false); void refresh(); }} />
  </div>;
}
