import { useEffect, useState, type FormEvent } from 'react';
import {
  Activity, Bell, Calendar, CalendarCheck, Check, LayoutDashboard,
  LogOut, Menu, Stethoscope, X,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { apiRequest } from '../lib/api';

type DoctorSection = 'overview' | 'appointments' | 'schedule' | 'leave' | 'notifications';
type Appointment = {
  id: string;
  patient_name: string;
  consultation_type: string;
  specialty: string;
  starts_at: string;
  mode: string;
  status: string;
};
type Notification = { id: string; title: string; message: string; read_at: string | null; created_at: string };
type LeaveRequest = { id: string; starts_on: string; ends_on: string; leave_type: string; reason: string; status: string; review_note: string | null };
type DoctorAccount = { id: string; user_id: string; full_name: string; specialty: string };
type AvailabilitySlot = { id: string; starts_at: string; ends_at: string };

function VisitWorkflow({ appointmentId, onSaved }: { appointmentId: string; onSaved: () => void }) {
  const [visitId, setVisitId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function createVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const numberValue = (name: string) => form.get(name) ? Number(form.get(name)) : null;
    try {
      const result = await apiRequest<{ data: { id: string } }>('/api/patient-visits', {
        method: 'POST',
        body: JSON.stringify({
          appointmentId,
          chiefComplaint: form.get('chiefComplaint'),
          history: form.get('history') || null,
          examination: form.get('examination') || null,
          assessment: form.get('assessment') || null,
          plan: form.get('plan') || null,
          temperatureC: numberValue('temperatureC'),
          bloodPressureSystolic: numberValue('bloodPressureSystolic'),
          bloodPressureDiastolic: numberValue('bloodPressureDiastolic'),
          heartRate: numberValue('heartRate'),
          respiratoryRate: numberValue('respiratoryRate'),
          oxygenSaturation: numberValue('oxygenSaturation'),
          weightKg: numberValue('weightKg'),
        }),
      });
      setVisitId(result.data.id);
      setMessage('Visit saved. Prescriptions and lab orders can now be added.');
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save the visit.');
    } finally {
      setSaving(false);
    }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>, kind: 'prescriptions' | 'lab-orders') {
    event.preventDefault();
    if (!visitId) return;
    setSaving(true);
    setError('');
    setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await apiRequest(`/api/${kind}`, { method: 'POST', body: JSON.stringify({ ...values, visitId }) });
      event.currentTarget.reset();
      setMessage(kind === 'prescriptions' ? 'Prescription saved.' : 'Laboratory order saved.');
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save order.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="doctor-visit-workflow">
    {!visitId ? <form onSubmit={createVisit} className="doctor-form-grid">
      <label className="doctor-full-field">Chief complaint<textarea name="chiefComplaint" required maxLength={4000} /></label>
      <label className="doctor-full-field">History<textarea name="history" maxLength={10000} /></label>
      <label className="doctor-full-field">Examination<textarea name="examination" maxLength={10000} /></label>
      <label className="doctor-full-field">Assessment<textarea name="assessment" maxLength={10000} /></label>
      <label className="doctor-full-field">Plan<textarea name="plan" maxLength={10000} /></label>
      <label>Temperature °C<input name="temperatureC" type="number" step="0.1" min="25" max="45" /></label>
      <label>Systolic BP<input name="bloodPressureSystolic" type="number" min="40" max="300" /></label>
      <label>Diastolic BP<input name="bloodPressureDiastolic" type="number" min="20" max="200" /></label>
      <label>Heart rate<input name="heartRate" type="number" min="20" max="250" /></label>
      <label>Respiratory rate<input name="respiratoryRate" type="number" min="5" max="80" /></label>
      <label>Oxygen saturation %<input name="oxygenSaturation" type="number" step="0.1" min="0" max="100" /></label>
      <label>Weight kg<input name="weightKg" type="number" step="0.01" min="0" max="1000" /></label>
      <button className="doctor-btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save clinical visit'}</button>
    </form> : <div className="doctor-order-grid">
      <form className="doctor-panel" onSubmit={(event) => void createOrder(event, 'prescriptions')}><h3>Prescription</h3>
        <label>Medication<input name="medication" required maxLength={200} /></label><label>Dosage<input name="dosage" required maxLength={200} /></label>
        <label>Route<input name="route" maxLength={80} /></label><label>Frequency<input name="frequency" required maxLength={200} /></label>
        <label>Duration<input name="duration" required maxLength={200} /></label><label>Quantity<input name="quantity" maxLength={100} /></label>
        <label>Instructions<textarea name="instructions" maxLength={4000} /></label><button className="doctor-btn-primary" disabled={saving}>Save prescription</button>
      </form>
      <form className="doctor-panel" onSubmit={(event) => void createOrder(event, 'lab-orders')}><h3>Laboratory order</h3>
        <label>Test name<input name="testName" required maxLength={200} /></label><label>Clinical indication<textarea name="clinicalIndication" maxLength={4000} /></label>
        <button className="doctor-btn-primary" disabled={saving}>Place lab order</button>
      </form>
    </div>}
    {message && <p role="status">{message}</p>}{error && <p className="doctor-error" role="alert">{error}</p>}
  </div>;
}

const navItems: { id: DoctorSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'appointments', label: 'Appointments', icon: CalendarCheck },
  { id: 'schedule', label: 'My Availability', icon: Calendar },
  { id: 'leave', label: 'Leave Requests', icon: Calendar },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

async function loadDoctorData() {
  const [appointments, notifications] = await Promise.all([
    apiRequest<{ data: Appointment[] }>('/api/appointments'),
    apiRequest<{ data: Notification[] }>('/api/notifications'),
  ]);
  return { appointments: appointments.data, notifications: notifications.data };
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function DoctorDashboard() {
  const { profile, signOut } = useAuth();
  const [section, setSection] = useState<DoctorSection>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [doctorRecord, setDoctorRecord] = useState<DoctorAccount | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [availabilityDate, setAvailabilityDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visitAppointmentId, setVisitAppointmentId] = useState<string | null>(null);

  async function refresh() {
    try {
      setError('');
      const data = await loadDoctorData();
      setAppointments(data.appointments);
      setNotifications(data.notifications);
      const leave = await apiRequest<{ data: LeaveRequest[] }>('/api/leave-requests');
      setLeaveRequests(leave.data);
      const doctors = await apiRequest<{ data: DoctorAccount[] }>('/api/doctors');
      setDoctorRecord(doctors.data.find((doctor) => doctor.user_id === profile?.id) ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load clinic records.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const data = await loadDoctorData();
        const [leave, doctors] = await Promise.all([
          apiRequest<{ data: LeaveRequest[] }>('/api/leave-requests'),
          apiRequest<{ data: DoctorAccount[] }>('/api/doctors'),
        ]);
        if (!active) return;
        setAppointments(data.appointments);
        setNotifications(data.notifications);
        setLeaveRequests(leave.data);
        setDoctorRecord(doctors.data.find((doctor) => doctor.user_id === profile?.id) ?? null);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load clinic records.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => { active = false; };
  }, [profile?.id]);

  useEffect(() => {
    if (!doctorRecord || !availabilityDate) return;
    let active = true;
    apiRequest<{ data: AvailabilitySlot[] }>(`/api/doctors/${doctorRecord.id}/availability?date=${availabilityDate}`)
      .then((result) => { if (active) setAvailability(result.data); })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load availability.'); });
    return () => { active = false; };
  }, [doctorRecord, availabilityDate]);

  async function addAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!doctorRecord) return;
    const form = new FormData(event.currentTarget);
    const startsAt = new Date(`${availabilityDate}T${String(form.get('startsAt'))}:00`);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    try {
      await apiRequest('/api/availability-slots', { method: 'POST', body: JSON.stringify({ doctorId: doctorRecord.id, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }) });
      const result = await apiRequest<{ data: AvailabilitySlot[] }>(`/api/doctors/${doctorRecord.id}/availability?date=${availabilityDate}`);
      setAvailability(result.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to add availability.');
    }
  }

  async function updateStatus(id: string, status: 'in_progress' | 'completed' | 'no_show') {
    try {
      await apiRequest(`/api/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update appointment.');
    }
  }

  async function markRead(id: string) {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update notification.');
    }
  }

  const upcoming = appointments.filter((item) => ['pending', 'confirmed'].includes(item.status));
  const inProgress = appointments.filter((item) => item.status === 'in_progress');
  const completed = appointments.filter((item) => item.status === 'completed');
  const activeItem = navItems.find((item) => item.id === section);

  async function submitLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await apiRequest('/api/leave-requests', { method: 'POST', body: JSON.stringify(values) });
      event.currentTarget.reset();
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to submit leave request.');
    }
  }

  const appointmentsTable = <div className="doctor-panel doctor-appointments-panel"><div className="doctor-panel-header"><h2><CalendarCheck size={18} />Assigned Appointments</h2></div>
    {!appointments.length ? <div className="doctor-empty-state">No appointments are assigned to your account.</div> :
      <div className="doctor-table-wrap"><table className="admin-table doctor-table"><thead><tr><th>Patient</th><th>Consultation</th><th>Date and time</th><th>Mode</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {appointments.map((appointment) => <><tr key={appointment.id}><td><strong>{appointment.patient_name}</strong></td><td>{appointment.consultation_type}</td><td>{formatDate(appointment.starts_at)}</td><td>{appointment.mode === 'in_person' ? 'In person' : 'Telehealth'}</td><td><span className={`admin-status-pill ${appointment.status.replace(/_/g, '-')}`}>{appointment.status.replace(/_/g, ' ')}</span></td><td>
          {appointment.status === 'confirmed' && <button className="doctor-btn-primary" onClick={() => void updateStatus(appointment.id, 'in_progress')}>Start visit</button>}
          {appointment.status === 'in_progress' && <button className="doctor-btn-primary" onClick={() => void updateStatus(appointment.id, 'completed')}><Check size={15} />Complete</button>}
          {appointment.status === 'confirmed' && <button className="doctor-btn-secondary" onClick={() => void updateStatus(appointment.id, 'no_show')}>No show</button>}
          {appointment.status === 'in_progress' && <button className="doctor-btn-secondary" onClick={() => setVisitAppointmentId(visitAppointmentId === appointment.id ? null : appointment.id)}>Clinical record</button>}
        </td></tr>{visitAppointmentId === appointment.id && <tr key={`${appointment.id}-visit`}><td colSpan={6}><VisitWorkflow appointmentId={appointment.id} onSaved={() => void refresh()} /></td></tr>}</>)}
      </tbody></table></div>}
  </div>;

  const content = section === 'appointments' ? <section className="admin-section"><div className="doctor-section-heading"><div><h1>Appointments</h1><p>Appointments assigned to your clinician account.</p></div><CalendarCheck className="doctor-heading-mark" size={28} /></div>{appointmentsTable}</section>
    : section === 'schedule' ? <section className="admin-section"><div className="doctor-section-heading"><div><h1>My Availability</h1><p>Add 30-minute appointment slots within clinic hours.</p></div></div>
      {!doctorRecord && <div className="doctor-error" role="alert">Your clinician directory profile is not active. Contact an administrator.</div>}
      {doctorRecord && <><form className="doctor-panel doctor-form-grid" onSubmit={(event) => void addAvailability(event)}><label>Date<input type="date" value={availabilityDate} onChange={(event) => setAvailabilityDate(event.target.value)} required /></label><label>Start time<input name="startsAt" type="time" step="1800" min="08:00" max="16:45" required /></label><button className="doctor-btn-primary" disabled={!availabilityDate}>Add 30-minute slot</button></form>
        <div className="doctor-panel"><h2>Available slots</h2>{availability.length ? availability.map((slot) => <div className="doctor-request" key={slot.id}><span>{new Date(slot.starts_at).toLocaleString()}</span><small>until {new Date(slot.ends_at).toLocaleTimeString()}</small></div>) : <p>No slots available for this date.</p>}</div></>}
      </section>
    : section === 'leave' ? <section className="admin-section"><div className="doctor-section-heading"><div><h1>Leave Requests</h1><p>Submit leave dates for administrator review.</p></div></div><form className="doctor-panel doctor-form-grid" onSubmit={submitLeave}><label>Start date<input name="startsOn" type="date" required /></label><label>End date<input name="endsOn" type="date" required /></label><label>Leave type<select name="leaveType"><option value="annual">Annual</option><option value="sick">Sick</option><option value="emergency">Emergency</option><option value="personal">Personal</option></select></label><label className="doctor-full-field">Reason<textarea name="reason" required maxLength={4000} /></label><button className="doctor-btn-primary">Submit request</button></form><div className="doctor-panel"><h2>My requests</h2>{leaveRequests.length ? leaveRequests.map((request) => <div className="doctor-request" key={request.id}><span>{request.leave_type}</span><small>{request.starts_on} to {request.ends_on}</small><span className={`admin-status-pill ${request.status}`}>{request.status}</span>{request.review_note && <small>{request.review_note}</small>}</div>) : <p>No leave requests.</p>}</div></section>
    : section === 'notifications' ? <section className="admin-section"><div className="doctor-section-heading"><div><h1>Notifications</h1><p>Updates generated by clinic activity.</p></div><Bell className="doctor-heading-mark" size={28} /></div><div className="doctor-panel">
      {!notifications.length ? <div className="doctor-empty-state">No notifications yet.</div> : notifications.map((item) => <button className={`doctor-notification ${item.read_at ? '' : 'unread'}`} key={item.id} onClick={() => !item.read_at && void markRead(item.id)}><span><strong>{item.title}</strong><small>{item.message}</small><em>{formatDate(item.created_at)}</em></span></button>)}
    </div></section>
    : <section className="admin-section"><div className="doctor-section-heading"><div><h1>Doctor Dashboard</h1><p>Live appointment activity for {profile?.full_name || profile?.email}.</p></div><Stethoscope className="doctor-heading-mark" size={28} /></div>
      <div className="doctor-stats-grid"><div className="doctor-stat-card red"><span className="doctor-stat-icon"><CalendarCheck size={23} /></span><div><small>Pending / Confirmed</small><strong>{upcoming.length}</strong><span>Upcoming appointments</span></div></div><div className="doctor-stat-card orange"><span className="doctor-stat-icon"><Activity size={23} /></span><div><small>In Progress</small><strong>{inProgress.length}</strong><span>Visits underway</span></div></div><div className="doctor-stat-card green"><span className="doctor-stat-icon"><Check size={23} /></span><div><small>Completed</small><strong>{completed.length}</strong><span>Recorded visits</span></div></div><div className="doctor-stat-card gold"><span className="doctor-stat-icon"><Bell size={23} /></span><div><small>Unread Notifications</small><strong>{notifications.filter((item) => !item.read_at).length}</strong><span>Clinic updates</span></div></div></div>
      {appointmentsTable}
    </section>;

  return <div className="admin-shell doctor-shell"><aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
    <div className="admin-sidebar-header"><span className="admin-sidebar-logo"><Stethoscope size={25} /></span><div><strong>SCCPMS</strong><small>Doctor Workspace</small></div></div>
    <nav className="admin-nav">{navItems.map((item) => <button key={item.id} className={`admin-nav-item ${section === item.id ? 'active' : ''}`} onClick={() => { setSection(item.id); setSidebarOpen(false); }}><item.icon size={20} /><span>{item.label}</span>{item.id === 'notifications' && notifications.some((notice) => !notice.read_at) && <b>{notifications.filter((notice) => !notice.read_at).length}</b>}</button>)}</nav>
    <button className="admin-signout" onClick={signOut}><LogOut size={20} />Sign Out</button>
  </aside>
  {sidebarOpen && <div className="admin-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
  <div className="admin-main"><header className="admin-topbar"><button className="admin-menu-btn" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle menu">{sidebarOpen ? <X size={22} /> : <Menu size={22} />}</button>
    <div className="admin-topbar-title">{activeItem && <activeItem.icon size={20} />}<h2>{activeItem?.label}</h2></div><div className="admin-topbar-actions"><span className="doctor-date"><Calendar size={16} />{new Date().toLocaleDateString()}</span><div className="admin-user-chip"><div className="admin-user-avatar">{profile?.full_name?.charAt(0).toUpperCase() || 'D'}</div><div><strong>{profile?.full_name || profile?.email}</strong><small>Doctor</small></div></div></div>
  </header><div className="admin-content">{error && <div className="doctor-error" role="alert">{error}<button onClick={() => void refresh()}>Retry</button></div>}{loading ? <div className="admin-section">Loading assigned appointments…</div> : content}</div></div></div>;
}
