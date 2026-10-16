import StaffAccounts from './admin/StaffAccounts';
import ProfilePhoto from './ProfilePhoto';
import AccountRecords from './admin/AccountRecords';
import OperationalReports from './admin/OperationalReports';
import AuditLog from './admin/AuditLog';
import ClinicClosures from './admin/ClinicClosures';
import AppointmentActivity from './admin/AppointmentActivity';
import type { ClinicAnalytics } from '../lib/analytics';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Activity, Bell, Calendar, CalendarCheck, FileText, LayoutDashboard, LogOut, Menu, Stethoscope, Users, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { apiRequest } from '../lib/api';
import { clinicDate, clinicTimeToIso, formatClinicDate } from '../lib/clinic-time';
import { useLiveRefresh } from '../lib/useClinicRefresh';
import StaffRegistrationModal from './admin/StaffRegistrationModal';
import SidebarBrand from './SidebarBrand';
import { AppointmentsView, PatientsView, NotificationsView, RefreshButton, type ClinicAppointment, type ClinicDoctor, type ClinicNotification, type ClinicPatient, type ClinicStaff } from './admin/ClinicOperations';

type AdminSection = 'overview' | 'staff' | 'patients' | 'appointments' | 'schedule' | 'reports' | 'leave' | 'logs' | 'notifications' | 'records';
type AuditEvent = { id: string; actor_user_id: string; action: string; entity_type: string; entity_id: string | null; created_at: string };
type LeaveRequest = { id: string; doctor_user_id: string; starts_on: string; ends_on: string; leave_type: string; reason: string; status: string; review_note: string | null };
type Settings = { timezone: string; opens_at: string; closes_at: string; default_appointment_minutes: number; minimum_reschedule_notice_hours: number };
type AdminData = { doctors: ClinicDoctor[]; staff: ClinicStaff[]; patients: ClinicPatient[]; appointments: ClinicAppointment[]; auditEvents: AuditEvent[]; leaveRequests: LeaveRequest[]; notifications: ClinicNotification[]; settings: Settings | null; analytics: ClinicAnalytics | null };
const navItems: { id: AdminSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'staff', label: 'Doctors & Staff', icon: Stethoscope },
  { id: 'patients', label: 'Patients', icon: Users }, { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'schedule', label: 'Availability & Settings', icon: CalendarCheck }, { id: 'records', label: 'Records', icon: FileText }, { id: 'reports', label: 'Reports', icon: Activity },
  { id: 'leave', label: 'Leave Requests', icon: Calendar }, { id: 'logs', label: 'Audit Log', icon: FileText }, { id: 'notifications', label: 'Notifications', icon: Bell },
];
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unable to save this change.';

function ScheduleAdminView({ doctors, settings, onSaved }: { doctors: ClinicDoctor[]; settings: Settings | null; onSaved: () => Promise<void> }) {
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [slots, setSlots] = useState<Array<{ id: string; starts_at: string; ends_at: string; status: string }>>([]);
  const [hours, setHours] = useState<Settings | null>(settings);
  const [duration, setDuration] = useState(settings?.default_appointment_minutes || 30);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const timezone = settings?.timezone || 'Africa/Johannesburg';
  const slotSequence = useRef(0);
  const [slotError, setSlotError] = useState('');
  const loadSlots = useCallback(async () => {
    const request = ++slotSequence.current;
    if (!doctorId) { setSlots([]); return; }
    try { const result = await apiRequest<{ data: typeof slots }>(`/api/availability-slots?doctorId=${doctorId}`); if (request === slotSequence.current) { setSlots(result.data.filter((slot) => !date || clinicDate(slot.starts_at, timezone) === date)); setSlotError(''); } } catch (requestError) { if (request === slotSequence.current) { setSlotError(errorMessage(requestError)); setSlots([]); } }
  }, [doctorId, date, timezone]);
  useLiveRefresh(loadSlots);
  useEffect(() => {
    setSlots([]); void loadSlots();
  }, [loadSlots]);
  async function addSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      const startsAt = clinicTimeToIso(date, startTime, timezone);
      const endsAt = new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();
      await apiRequest('/api/availability-slots', { method: 'POST', body: JSON.stringify({ doctorId, startsAt, endsAt }) }); setSuccess('Availability slot created.'); await loadSlots(); await onSaved();
    } catch (requestError) { setError(errorMessage(requestError)); } finally { setBusy(false); }
  }
  async function changeSlot(id: string, method: 'DELETE' | 'PATCH', status?: string) {
    setBusy(true); setError(''); setSuccess('');
    try { await apiRequest(`/api/availability-slots/${id}`, { method, ...(status ? { body: JSON.stringify({ status }) } : {}) }); setSuccess(method === 'DELETE' ? 'Availability slot deleted.' : `Availability slot ${status}.`); await loadSlots(); await onSaved(); } catch (requestError) { setError(errorMessage(requestError)); } finally { setBusy(false); }
  }
  async function saveHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!hours) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const result = await apiRequest<{ data: Settings }>('/api/clinic/settings', { method: 'PUT', body: JSON.stringify({ timezone: hours.timezone, opensAt: String(hours.opens_at).slice(0, 5), closesAt: String(hours.closes_at).slice(0, 5), defaultAppointmentMinutes: hours.default_appointment_minutes, minimumRescheduleNoticeHours: hours.minimum_reschedule_notice_hours }) }); setHours(result.data); setSuccess('Clinic booking policy saved.'); await onSaved();
    } catch (requestError) { setError(errorMessage(requestError)); } finally { setBusy(false); }
  }
  return <section className="clinic-ops"><div className="clinic-ops-heading"><div><h1>Availability & Clinic Settings</h1><p>Create bookable doctor times and configure clinic hours and booking policies.</p></div></div>{error && <p className="clinic-ops-error" role="alert">{error}</p>}{slotError && <p className="clinic-ops-error" role="alert">{slotError}</p>}{success && <p className="clinic-ops-success" role="status">{success}</p>}
    {hours ? <form className="clinic-ops-form" onSubmit={saveHours}><h2>Clinic booking policy</h2><label>Timezone<input value={hours.timezone} onChange={(event) => setHours({ ...hours, timezone: event.target.value })} required /></label><label>Opens at<input type="time" value={String(hours.opens_at).slice(0, 5)} onChange={(event) => setHours({ ...hours, opens_at: event.target.value })} required /></label><label>Closes at<input type="time" value={String(hours.closes_at).slice(0, 5)} onChange={(event) => setHours({ ...hours, closes_at: event.target.value })} required /></label><label>Default duration (minutes)<input type="number" min={10} max={30} value={hours.default_appointment_minutes} onChange={(event) => setHours({ ...hours, default_appointment_minutes: Number(event.target.value) })} required /></label><label>Reschedule notice (hours)<input type="number" min={0} max={168} value={hours.minimum_reschedule_notice_hours} onChange={(event) => setHours({ ...hours, minimum_reschedule_notice_hours: Number(event.target.value) })} required /></label><div className="clinic-ops-actions clinic-ops-wide"><button className="primary" disabled={busy}>Save clinic policy</button></div></form> : <p className="clinic-ops-error">Clinic settings could not be loaded. Refresh before creating availability.</p>}
    <form className="clinic-ops-form" onSubmit={addSlot}><h2>Doctor availability</h2><p className="clinic-ops-wide clinic-ops-muted">Dates and times use the saved clinic timezone: {timezone}.</p><label>Doctor<select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required><option value="">Choose doctor</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name} · {doctor.specialty}</option>)}</select></label><label>Date<input type="date" min={clinicDate(new Date(), timezone)} value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Start time<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label><label>Duration (minutes)<input type="number" min={10} max={30} required value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label><div className="clinic-ops-actions clinic-ops-wide"><button className="primary" type="submit" disabled={busy || !doctorId || !date || !settings}>Create slot</button><button type="button" disabled={busy || !doctorId} onClick={() => void loadSlots()}>Refresh slots</button></div></form>
    {doctorId && <div className="clinic-ops-table"><table><thead><tr><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr></thead><tbody>{slots.map((slot) => <tr key={slot.id}><td>{formatClinicDate(slot.starts_at, timezone)}</td><td>{formatClinicDate(slot.ends_at, timezone)}</td><td>{slot.status}</td><td><div className="clinic-ops-actions">{slot.status === 'available' && <><button disabled={busy} onClick={() => void changeSlot(slot.id, 'PATCH', 'blocked')}>Block booking</button><button className="danger" disabled={busy} onClick={() => void changeSlot(slot.id, 'DELETE')}>Delete</button></>}{slot.status === 'blocked' && <button disabled={busy} onClick={() => void changeSlot(slot.id, 'PATCH', 'available')}>Reopen booking</button>}</div></td></tr>)}{!slots.length && <tr><td colSpan={4} className="clinic-ops-empty">No availability slots for the selected doctor and date.</td></tr>}</tbody></table></div>}
  </section>;
}

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const [section, setSection] = useState<AdminSection>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [staffRole, setStaffRole] = useState<'doctor' | 'receptionist'>('doctor');
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [data, setData] = useState<AdminData>({ doctors: [], staff: [], patients: [], appointments: [], auditEvents: [], leaveRequests: [], notifications: [], settings: null, analytics: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshSequence = useRef(0);
  async function refresh() {
    const request = ++refreshSequence.current;
    try {
      const [doctors, staff, patients, appointments, auditEvents, leaveRequests, notifications, settings, analytics] = await Promise.all([
        apiRequest<{ data: ClinicDoctor[] }>('/api/doctors'), apiRequest<{ data: ClinicStaff[] }>('/api/staff'), apiRequest<{ data: ClinicPatient[] }>('/api/patients'), apiRequest<{ data: ClinicAppointment[] }>('/api/appointments'), apiRequest<{ data: AuditEvent[] }>('/api/audit-events'), apiRequest<{ data: LeaveRequest[] }>('/api/leave-requests'), apiRequest<{ data: ClinicNotification[] }>('/api/notifications'), apiRequest<{ data: Settings }>('/api/clinic/settings'), apiRequest<{ data: ClinicAnalytics }>('/api/analytics'),
      ]);
      if (request === refreshSequence.current) { setData({ doctors: doctors.data, staff: staff.data, patients: patients.data, appointments: appointments.data, auditEvents: auditEvents.data, leaveRequests: leaveRequests.data, notifications: notifications.data, settings: settings.data, analytics: analytics.data }); setError(''); setLastUpdated(new Date()); }
    } catch (requestError) { if (request === refreshSequence.current) setError(errorMessage(requestError)); } finally { if (request === refreshSequence.current) setLoading(false); }
  }
  useLiveRefresh(refresh);
  const timezone = data.settings?.timezone || 'Africa/Johannesburg';
  const changeSection = (next: AdminSection) => { setSection(next); setSidebarOpen(false); setActionError(''); };
  const invite = (role: 'doctor' | 'receptionist') => { setStaffRole(role); setStaffModalOpen(true); };
  const accountNames = new Map([...data.staff.map((member) => [member.id, member.full_name || member.email] as const), ...data.patients.map((patient) => [patient.id, patient.full_name || patient.email] as const), ...(profile ? [[profile.id, profile.full_name || profile.email] as const] : [])]);
  async function decideLeave(id: string, status: 'approved' | 'rejected') {
    setLeaveBusy(true); setActionError('');
    try { await apiRequest(`/api/leave-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status, reviewNote: reviewNotes[id] || null }) }); await refresh(); } catch (requestError) { setActionError(errorMessage(requestError)); } finally { setLeaveBusy(false); }
  }
  const leaveContent = <section className="clinic-ops"><div className="clinic-ops-heading"><div><h1>Leave Requests</h1><p>Review doctor leave and its effect on availability. Handle scheduled appointments before approval.</p></div></div><div className="clinic-ops-table"><table><thead><tr><th>Doctor</th><th>Type & dates</th><th>Reason</th><th>Status</th><th>Review</th></tr></thead><tbody>{data.leaveRequests.map((request) => <tr key={request.id}><td>{accountNames.get(request.doctor_user_id) || request.doctor_user_id}</td><td>{request.leave_type}<small>{request.starts_on.slice(0, 10)} to {request.ends_on.slice(0, 10)}</small></td><td>{request.reason}</td><td>{request.status}</td><td>{request.status === 'pending' ? <><label>Review note<textarea className="clinic-ops-select" maxLength={2000} value={reviewNotes[request.id] || ''} onChange={(event) => setReviewNotes({ ...reviewNotes, [request.id]: event.target.value })} /></label><div className="clinic-ops-actions"><button className="primary" disabled={leaveBusy} onClick={() => void decideLeave(request.id, 'approved')}>Approve</button><button disabled={leaveBusy} onClick={() => void decideLeave(request.id, 'rejected')}>Reject</button></div></> : request.review_note || '—'}</td></tr>)}{!data.leaveRequests.length && <tr><td colSpan={5} className="clinic-ops-empty">No leave requests have been submitted.</td></tr>}</tbody></table></div></section>;
  const logsContent = <AuditLog names={accountNames} timezone={timezone} />;
  const today = clinicDate(new Date(), timezone);
  const todayAppointments = data.appointments.filter((appointment) => clinicDate(appointment.starts_at, timezone) === today).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const overview = <section className="clinic-ops"><div className="clinic-ops-heading"><div><h1>Clinic Overview</h1><p>Current records from the clinic database. Today: {today} ({timezone}).</p></div></div><div className="admin-stats-grid"><div className="admin-stat-card"><Users size={21} /><span>Active patients</span><strong>{data.analytics?.patients ?? 0}</strong></div><div className="admin-stat-card"><Stethoscope size={21} /><span>Active doctors</span><strong>{data.analytics?.doctors ?? 0}</strong></div><div className="admin-stat-card"><CalendarCheck size={21} /><span>Today's appointments</span><strong>{data.analytics?.appointmentsToday ?? 0}</strong></div><div className="admin-stat-card"><Activity size={21} /><span>Pending leave requests</span><strong>{data.analytics?.pendingLeaveRequests ?? 0}</strong></div><div className="admin-stat-card"><FileText size={21} /><span>Clinical visits</span><strong>{data.analytics?.clinicalVisits ?? 0}</strong></div><div className="admin-stat-card"><Users size={21} /><span>Active staff</span><strong>{data.analytics?.staff ?? 0}</strong></div></div><div className="clinic-ops-actions"><button onClick={() => changeSection('appointments')}>Manage appointments</button><button onClick={() => changeSection('patients')}>Register patient</button><button onClick={() => changeSection('schedule')}>Manage availability</button><button onClick={() => changeSection('leave')}>Review leave</button></div><div className="clinic-ops-table"><table><thead><tr><th>Today's patient</th><th>Doctor</th><th>Time</th><th>Status</th></tr></thead><tbody>{todayAppointments.map((appointment) => <tr key={appointment.id}><td>{appointment.patient_name}</td><td>{appointment.doctor_name}</td><td>{formatClinicDate(appointment.starts_at, timezone)}</td><td>{appointment.status.replace(/_/g, ' ')}</td></tr>)}{!todayAppointments.length && <tr><td colSpan={4} className="clinic-ops-empty">No appointments scheduled for today.</td></tr>}</tbody></table></div></section>;
  const content = section === 'overview' ? <>{overview}<AppointmentActivity analytics={data.analytics} /></> : section === 'staff' ? <StaffAccounts staff={data.staff} onSaved={refresh} onInvite={invite} /> : section === 'patients' ? <PatientsView patients={data.patients} admin onSaved={refresh} /> : section === 'appointments' ? <AppointmentsView appointments={data.appointments} doctors={data.doctors} patients={data.patients} timezone={timezone} onSaved={refresh} /> : section === 'schedule' ? <><ScheduleAdminView doctors={data.doctors} settings={data.settings} onSaved={refresh} /><ClinicClosures /></> : section === 'records' ? <AccountRecords timezone={timezone} /> : section === 'reports' ? <OperationalReports timezone={timezone} /> : section === 'leave' ? leaveContent : section === 'notifications' ? <NotificationsView notifications={data.notifications} onSaved={refresh} timezone={timezone} /> : logsContent;
  const activeItem = navItems.find((item) => item.id === section);
  return <div className="admin-shell"><aside id="admin-sidebar" className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}><SidebarBrand workspace="Administration" /><nav className="admin-nav">{navItems.map((item) => <button key={item.id} className={`admin-nav-item ${section === item.id ? 'active' : ''}`} onClick={() => changeSection(item.id)}><item.icon size={20} /><span>{item.label}</span></button>)}</nav><button className="admin-signout" onClick={signOut}><LogOut size={20} />Sign Out</button></aside>{sidebarOpen && <div className="admin-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
    <div className="admin-main"><header className="admin-topbar"><button className="admin-menu-btn" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle menu" aria-expanded={sidebarOpen} aria-controls="admin-sidebar">{sidebarOpen ? <X size={22} /> : <Menu size={22} />}</button><div className="admin-topbar-title">{activeItem && <activeItem.icon size={20} />}<h2>{activeItem?.label}</h2></div><div className="admin-topbar-actions"><RefreshButton refresh={refresh} /><button className="admin-icon-btn" onClick={() => changeSection('notifications')} aria-label="Notifications"><Bell size={20} />{data.notifications.some((notification) => !notification.read_at) && <span className="admin-badge-dot" />}</button><div className="admin-user-chip"><ProfilePhoto className="admin-user-avatar" /><div><strong>{profile?.full_name || profile?.email || 'Administrator'}</strong><small>Administrator</small></div></div></div></header><div className="admin-content">{lastUpdated && <p className="clinic-ops-muted">Updated {lastUpdated.toLocaleTimeString(undefined, { timeZone: timezone })} · Live updates ? 15-second fallback</p>}{error && <div className="admin-error" role="alert">{error} <button className="clinic-ops-button" onClick={() => void refresh()}>Retry</button></div>}{actionError && <div className="admin-error" role="alert">{actionError}</div>}{loading ? <div className="admin-section">Loading clinic records…</div> : content}</div></div>
    <StaffRegistrationModal open={staffModalOpen} defaultRole={staffRole} onClose={() => { setStaffModalOpen(false); void refresh(); }} />
  </div>;
}
