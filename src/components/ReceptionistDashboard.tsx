import AvailabilitySchedule from './AvailabilitySchedule';
import type { ClinicAnalytics } from '../lib/analytics';
import { useRef, useState, type FormEvent } from 'react';
import { Bell, Calendar, CalendarCheck, Check, Clock3, Home, LogOut, Menu, Plus, Stethoscope, UserPlus, Users, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { apiRequest } from '../lib/api';
import { clinicDate, formatClinicDate } from '../lib/clinic-time';
import { useLiveRefresh } from '../lib/useClinicRefresh';
import SidebarBrand from './SidebarBrand';
import { AppointmentsView, NotificationsView, PatientsView, RefreshButton, type ClinicAppointment, type ClinicDoctor, type ClinicNotification, type ClinicPatient } from './admin/ClinicOperations';

type ReceptionistSection = 'overview' | 'appointments' | 'patients' | 'doctors' | 'walkins' | 'notifications' | 'schedule';
type WalkIn = { id: string; patient_user_id: string | null; patient_name: string; contact_phone: string | null; reason: string; urgency: 'low' | 'medium' | 'high' | 'emergency'; status: string; arrived_at: string; assigned_doctor_id: string | null; appointment_id: string | null };
type ReceptionData = { doctors: ClinicDoctor[]; patients: ClinicPatient[]; appointments: ClinicAppointment[]; notifications: ClinicNotification[]; walkIns: WalkIn[]; timezone: string; analytics: ClinicAnalytics | null };
const navItems: { id: ReceptionistSection; label: string; icon: typeof Home }[] = [
  { id: 'overview', label: 'Overview', icon: Home }, { id:'schedule',label:'Doctor Schedules',icon:CalendarCheck }, { id: 'appointments', label: 'Appointments', icon: CalendarCheck },
  { id: 'patients', label: 'Patients & Registration', icon: Users }, { id: 'doctors', label: 'Doctors', icon: Stethoscope },
  { id: 'walkins', label: 'Walk-in Queue', icon: UserPlus }, { id: 'notifications', label: 'Notifications', icon: Bell },
];
const message = (error: unknown) => error instanceof Error ? error.message : 'The change could not be saved. Please try again.';
const emptyWalkIn = { patientUserId: '', patientName: '', contactPhone: '', reason: '', urgency: 'medium' as WalkIn['urgency'] };

function Avatar({ name }: { name: string }) { return <span className="reception-avatar">{name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>; }

function WalkInsView({ walkIns, patients, doctors, appointments, timezone, onSaved, onAppointments, onRegister }: { walkIns: WalkIn[]; patients: ClinicPatient[]; doctors: ClinicDoctor[]; appointments: ClinicAppointment[]; timezone: string; onSaved: () => Promise<void>; onAppointments: () => void; onRegister: () => void }) {
  const [form, setForm] = useState(emptyWalkIn);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<WalkIn | null>(null);
  const removable = removing ? walkIns.find((walkIn) => walkIn.id === removing.id && !walkIn.appointment_id) : null;
  const doctorNames = new Map(doctors.map((doctor) => [doctor.id, doctor.full_name]));
  async function checkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try { await apiRequest('/api/walk-ins', { method: 'POST', body: JSON.stringify({ ...form, patientUserId: form.patientUserId || null, contactPhone: form.contactPhone || null }) }); setForm(emptyWalkIn); setSuccess('Patient checked into the walk-in queue.'); await onSaved(); } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  }
  async function update(id: string, fields: { status: string; urgency?: WalkIn['urgency']; doctorId?: string | null; patientUserId?: string }) {
    setBusy(true); setError(''); setSuccess('');
    try { await apiRequest(`/api/walk-ins/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }); await onSaved(); } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  }
  async function remove(walkIn: WalkIn) {
    setBusy(true); setError(''); setSuccess('');
    try { await apiRequest(`/api/walk-ins/${walkIn.id}`, { method: 'DELETE' }); setRemoving(null); setSuccess('Walk-in removed from the active queue.'); await onSaved(); } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  }
  function choosePatient(id: string) { const patient = patients.find((item) => item.id === id); setForm({ ...form, patientUserId: id, patientName: patient?.full_name || '', contactPhone: patient?.phone || '' }); }
  return <section className="clinic-ops"><div className="clinic-ops-heading"><div><h1>Walk-in Queue</h1><p>Check patients in, prioritize urgency and assign an available doctor. Times use {timezone}.</p></div></div>
    {error && <p className="clinic-ops-error" role="alert">{error}</p>}{success && <p className="clinic-ops-success" role="status">{success}</p>}
    <form className="clinic-ops-form" onSubmit={checkIn}><h2>Check in patient</h2><label>Registered patient (optional)<select value={form.patientUserId} onChange={(event) => choosePatient(event.target.value)}><option value="">New walk-in / not registered</option>{patients.filter((patient) => patient.active !== false).map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name || patient.email} · {patient.student_number || patient.staff_number || patient.email}</option>)}</select></label><label>Patient name<input required minLength={2} maxLength={160} value={form.patientName} onChange={(event) => setForm({ ...form, patientName: event.target.value })} /></label><label>Contact phone<input type="tel" maxLength={24} value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} /></label><label>Urgency<select value={form.urgency} onChange={(event) => setForm({ ...form, urgency: event.target.value as WalkIn['urgency'] })}>{['low', 'medium', 'high', 'emergency'].map((urgency) => <option value={urgency} key={urgency}>{urgency}</option>)}</select></label><label className="clinic-ops-wide">Reason for visit<textarea required maxLength={4000} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label><div className="clinic-ops-actions clinic-ops-wide"><button className="primary" disabled={busy}>{busy ? 'Saving…' : <><Plus size={16} />Check in</>}</button></div></form>
    {removable && <div className="clinic-ops-delete-confirm"><span>Remove {removable.patient_name} from the active queue?</span><div className="clinic-ops-actions"><button className="danger" disabled={busy} onClick={() => void remove(removable)}>Remove from queue</button><button disabled={busy} onClick={() => setRemoving(null)}>Keep in queue</button></div></div>}
    <div className="clinic-ops-table"><table><thead><tr><th>Patient</th><th>Reason & arrival</th><th>Urgency</th><th>Doctor</th><th>Status</th><th>Actions</th></tr></thead><tbody>{walkIns.map((walkIn) => {
      const appointment = appointments.find((item) => item.id === walkIn.appointment_id);
      const patient = patients.find((item) => item.id === walkIn.patient_user_id);
      return <tr key={walkIn.id}>
        <td>{walkIn.patient_name}<small>{walkIn.contact_phone || 'Phone not recorded'}</small>
          {walkIn.patient_user_id ? <small>Linked account: {patient?.full_name || patient?.email || 'Registered patient'}</small> : <>
            <label className="clinic-ops-muted">Link registered patient<select className="clinic-ops-select" aria-label={`Link patient account for ${walkIn.patient_name}`} disabled={busy} value="" onChange={(event) => { if (event.target.value) void update(walkIn.id, { status: walkIn.status, patientUserId: event.target.value }); }}>
              <option value="">Choose patient account</option>{patients.filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email} · {item.student_number || item.staff_number || item.email}</option>)}
            </select></label><div className="clinic-ops-actions"><button disabled={busy} onClick={onRegister}>Register patient</button></div>
          </>}
        </td>
        <td>{walkIn.reason}<small>{formatClinicDate(walkIn.arrived_at, timezone)}</small></td>
        <td><select className="clinic-ops-select" aria-label={`Urgency for ${walkIn.patient_name}`} disabled={busy} value={walkIn.urgency} onChange={(event) => void update(walkIn.id, { status: walkIn.status, urgency: event.target.value as WalkIn['urgency'] })}>{['low', 'medium', 'high', 'emergency'].map((urgency) => <option key={urgency} value={urgency}>{urgency}</option>)}</select></td>
        <td>{walkIn.appointment_id ? doctorNames.get(walkIn.assigned_doctor_id || '') || appointment?.doctor_name || 'Assigned doctor' : <select className="clinic-ops-select" aria-label={`Doctor for ${walkIn.patient_name}`} disabled={busy || walkIn.status === 'in_progress'} value={walkIn.assigned_doctor_id || ''} onChange={(event) => void update(walkIn.id, { status: event.target.value ? 'assigned' : 'waiting', doctorId: event.target.value || null })}><option value="">Unassigned</option>{walkIn.assigned_doctor_id && !doctorNames.has(walkIn.assigned_doctor_id) && <option value={walkIn.assigned_doctor_id}>Previously assigned doctor (inactive)</option>}{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>)}</select>}</td>
        <td>{(appointment?.status || walkIn.status).replace(/_/g, ' ')}{walkIn.appointment_id && <small>Linked clinical consultation</small>}</td>
        <td><div className="clinic-ops-actions">{walkIn.appointment_id ? <button disabled={busy} onClick={onAppointments}>View appointments</button> : <>
          {walkIn.status === 'waiting' && <button disabled={busy} onClick={() => void update(walkIn.id, { status: 'triaged' })}>Mark triaged</button>}
          {walkIn.assigned_doctor_id && ['assigned', 'triaged'].includes(walkIn.status) && <button disabled={busy} onClick={() => void update(walkIn.id, { status: 'in_progress' })}>Begin visit</button>}
          {walkIn.status === 'in_progress' && <button disabled={busy} onClick={() => void update(walkIn.id, { status: 'completed' })}>Complete visit</button>}
          <button className="danger" disabled={busy} onClick={() => setRemoving(walkIn)}>Remove</button>
        </>}</div></td>
      </tr>;
    })}{!walkIns.length && <tr><td colSpan={6} className="clinic-ops-empty">The active walk-in queue is empty.</td></tr>}</tbody></table></div>
  </section>;
}

export default function ReceptionistDashboard() {
  const { profile, signOut } = useAuth();
  const [section, setSection] = useState<ReceptionistSection>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<ReceptionData>({ doctors: [], patients: [], appointments: [], notifications: [], walkIns: [], timezone: 'Africa/Johannesburg', analytics: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshSequence = useRef(0);
  async function refresh() {
    const request = ++refreshSequence.current;
    try {
      const [doctors, patients, appointments, notifications, walkIns, settings, analytics] = await Promise.all([
        apiRequest<{ data: ClinicDoctor[] }>('/api/doctors'), apiRequest<{ data: ClinicPatient[] }>('/api/patients'), apiRequest<{ data: ClinicAppointment[] }>('/api/appointments'), apiRequest<{ data: ClinicNotification[] }>('/api/notifications'), apiRequest<{ data: WalkIn[] }>('/api/walk-ins'), apiRequest<{ data: { timezone: string } }>('/api/clinic/settings'), apiRequest<{ data: ClinicAnalytics }>('/api/analytics'),
      ]);
      if (request === refreshSequence.current) { setData({ doctors: doctors.data, patients: patients.data, appointments: appointments.data, notifications: notifications.data, walkIns: walkIns.data, timezone: settings.data.timezone, analytics: analytics.data }); setError(''); setLastUpdated(new Date()); }
    } catch (requestError) { if (request === refreshSequence.current) setError(message(requestError)); } finally { if (request === refreshSequence.current) setLoading(false); }
  }
  useLiveRefresh(refresh);
  const changeSection = (next: ReceptionistSection) => { setSection(next); setSidebarOpen(false); };
  const today = clinicDate(new Date(), data.timezone);
  const todayAppointments = data.appointments.filter((appointment) => clinicDate(appointment.starts_at, data.timezone) === today).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const activeItem = navItems.find((item) => item.id === section);
  const overview = <section className="clinic-ops"><div className="clinic-ops-heading"><div><h1>Reception Overview</h1><p>Current clinic records for {today} ({data.timezone}).</p></div></div><div className="reception-stat-grid"><div className="reception-stat red"><CalendarCheck size={23} /><div><small>Today's appointments</small><strong>{data.analytics?.appointmentsToday ?? 0}</strong><em>Scheduled visits today</em></div></div><div className="reception-stat gold"><Clock3 size={23} /><div><small>Pending requests</small><strong>{data.analytics?.pendingAppointments ?? 0}</strong><em>Awaiting confirmation</em></div></div><div className="reception-stat green"><Users size={23} /><div><small>Active patients</small><strong>{data.analytics?.patients ?? 0}</strong><em>Registered accounts</em></div></div><div className="reception-stat blue"><UserPlus size={23} /><div><small>Walk-ins</small><strong>{data.analytics?.activeWalkIns ?? 0}</strong><em>Active queue</em></div></div></div><div className="clinic-ops-actions"><button onClick={() => changeSection('appointments')}>Schedule appointment</button><button onClick={() => changeSection('patients')}>Register patient</button><button onClick={() => changeSection('walkins')}>Check in walk-in</button><button onClick={() => changeSection('notifications')}>View notifications</button></div><div className="clinic-ops-table"><table><thead><tr><th>Today's patient</th><th>Doctor</th><th>Time</th><th>Status</th></tr></thead><tbody>{todayAppointments.map((appointment) => <tr key={appointment.id}><td>{appointment.patient_name}</td><td>{appointment.doctor_name}</td><td>{formatClinicDate(appointment.starts_at, data.timezone)}</td><td>{appointment.status.replace(/_/g, ' ')}</td></tr>)}{!todayAppointments.length && <tr><td colSpan={4} className="clinic-ops-empty">No appointments scheduled for today.</td></tr>}</tbody></table></div></section>;
  const content = section === 'schedule' ? <AvailabilitySchedule doctors={data.doctors} timezone={data.timezone} /> : section === 'appointments' ? <AppointmentsView appointments={data.appointments} doctors={data.doctors} patients={data.patients} timezone={data.timezone} onSaved={refresh} /> : section === 'patients' ? <PatientsView patients={data.patients} onSaved={refresh} /> : section === 'walkins' ? <WalkInsView walkIns={data.walkIns} patients={data.patients} doctors={data.doctors} appointments={data.appointments} timezone={data.timezone} onSaved={refresh} onAppointments={() => changeSection('appointments')} onRegister={() => changeSection('patients')} /> : section === 'notifications' ? <NotificationsView notifications={data.notifications} onSaved={refresh} timezone={data.timezone} /> : section === 'doctors' ? <section className="clinic-ops"><div className="clinic-ops-heading"><div><h1>Doctor Directory</h1><p>Practitioners currently available for booking in the clinic.</p></div></div><div className="clinic-ops-table"><table><thead><tr><th>Doctor</th><th>Specialty</th><th>Department</th></tr></thead><tbody>{data.doctors.map((doctor) => <tr key={doctor.id}><td>{doctor.full_name}</td><td>{doctor.specialty}</td><td>{doctor.department || 'Not recorded'}</td></tr>)}{!data.doctors.length && <tr><td colSpan={3} className="clinic-ops-empty">No doctors are currently enabled for booking. An administrator can invite and activate doctors.</td></tr>}</tbody></table></div><div className="clinic-ops-actions"><button onClick={() => changeSection('appointments')}>Schedule appointment</button></div></section> : overview;
  return <div className="reception-shell"><aside id="reception-sidebar" className={`reception-sidebar ${sidebarOpen ? 'open' : ''}`}><SidebarBrand workspace="Reception Workspace" /><nav>{navItems.map((item) => <button className={section === item.id ? 'active' : ''} key={item.id} onClick={() => changeSection(item.id)}><item.icon size={20} /><span>{item.label}</span>{section === item.id && <Check size={16} />}</button>)}</nav><button className="reception-logout" onClick={signOut}><LogOut size={20} />Sign Out</button></aside>{sidebarOpen && <div className="reception-overlay" onClick={() => setSidebarOpen(false)} />}
    <main className="reception-main"><header className="reception-topbar"><button className="reception-menu" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle menu" aria-expanded={sidebarOpen} aria-controls="reception-sidebar">{sidebarOpen ? <X size={21} /> : <Menu size={21} />}</button><div className="reception-top-actions"><RefreshButton refresh={refresh} /><button className="clinic-ops-button" onClick={() => changeSection('notifications')}><Bell size={17} />{data.notifications.filter((notification) => !notification.read_at).length} unread</button><div className="reception-date"><Calendar size={17} />{today}</div><div className="reception-user"><Avatar name={profile?.full_name || profile?.email || 'Receptionist'} /><span><strong>{profile?.full_name || profile?.email}</strong><small>Receptionist</small></span></div></div></header>{activeItem && <div className="reception-pagebar"><div><activeItem.icon size={19} /><span>{activeItem.label}</span></div></div>}
    <div className="reception-content">{lastUpdated && <p className="clinic-ops-muted">Updated {lastUpdated.toLocaleTimeString(undefined, { timeZone: data.timezone })} · Live updates ? 15-second fallback</p>}{error && <div className="reception-error" role="alert">{error} <button className="clinic-ops-button" onClick={() => void refresh()}>Retry</button></div>}{loading ? <p>Loading clinic records…</p> : content}</div></main>
  </div>;
}
