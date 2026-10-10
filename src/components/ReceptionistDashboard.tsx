import { useEffect, useState, type FormEvent } from 'react';
import {
  Bell, Calendar, CalendarCheck, Check, Clock3, Home, LogOut,
  Menu, Plus, Search, ShieldCheck, Stethoscope, UserPlus, Users, X,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { apiRequest } from '../lib/api';

type ReceptionistSection = 'overview' | 'register' | 'appointments' | 'patients' | 'doctors' | 'walkins' | 'notifications';
type Doctor = { id: string; full_name: string; specialty: string; department: string | null };
type Patient = { id: string; email: string; full_name: string | null; phone: string | null; user_type: string | null; student_number: string | null; staff_number: string | null; department: string | null; program: string | null; created_at: string };
type Appointment = { id: string; patient_user_id: string; patient_name: string; doctor_name: string; specialty: string; consultation_type: string; starts_at: string; mode: string; status: string };
type Notification = { id: string; title: string; message: string; read_at: string | null; created_at: string };
type WalkIn = { id: string; patient_name: string; contact_phone: string | null; reason: string; urgency: 'low' | 'medium' | 'high' | 'emergency'; status: string; arrived_at: string; assigned_doctor_id: string | null };
type ReceptionData = { doctors: Doctor[]; patients: Patient[]; appointments: Appointment[]; notifications: Notification[]; walkIns: WalkIn[] };
type PatientForm = { email: string; fullName: string; phone: string; userType: 'Student' | 'Lecturer' | 'SPU Staff'; studentNumber: string; staffNumber: string; department: string; program: string };

const navItems: { id: ReceptionistSection; label: string; icon: typeof Home }[] = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'register', label: 'Invite Patient', icon: UserPlus },
  { id: 'appointments', label: 'Appointments', icon: CalendarCheck },
  { id: 'patients', label: 'Patients', icon: Users },
  { id: 'doctors', label: 'Doctors', icon: Stethoscope },
  { id: 'walkins', label: 'Walk-in Queue', icon: UserPlus },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

async function loadReceptionData(): Promise<ReceptionData> {
  const [doctors, patients, appointments, notifications, walkIns] = await Promise.all([
    apiRequest<{ data: Doctor[] }>('/api/doctors'),
    apiRequest<{ data: Patient[] }>('/api/patients'),
    apiRequest<{ data: Appointment[] }>('/api/appointments'),
    apiRequest<{ data: Notification[] }>('/api/notifications'),
    apiRequest<{ data: WalkIn[] }>('/api/walk-ins'),
  ]);
  return { doctors: doctors.data, patients: patients.data, appointments: appointments.data, notifications: notifications.data, walkIns: walkIns.data };
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function Avatar({ name }: { name: string }) {
  return <span className="reception-avatar">{name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="reception-empty-state">{children}</div>;
}

export default function ReceptionistDashboard() {
  const { profile, signOut } = useAuth();
  const [section, setSection] = useState<ReceptionistSection>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<ReceptionData>({ doctors: [], patients: [], appointments: [], notifications: [], walkIns: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<PatientForm>({ email: '', fullName: '', phone: '', userType: 'Student', studentNumber: '', staffNumber: '', department: '', program: '' });
  const [walkInForm, setWalkInForm] = useState({ patientName: '', contactPhone: '', reason: '', urgency: 'medium' as WalkIn['urgency'] });

  async function refresh() {
    try {
      setError('');
      setData(await loadReceptionData());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load clinic records.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function invitePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const phone = form.phone.replace(/[\s()-]/g, '');
      await apiRequest('/api/patients', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          phone,
          studentNumber: form.studentNumber || null,
          staffNumber: form.staffNumber || null,
          department: form.department || null,
          program: form.program || null,
        }),
      });
      setForm({ email: '', fullName: '', phone: '', userType: 'Student', studentNumber: '', staffNumber: '', department: '', program: '' });
      setSuccess('Invitation sent. The patient profile is now recorded.');
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to invite this patient.');
    }
  }

  async function updateStatus(id: string, status: 'confirmed' | 'cancelled') {
    try {
      await apiRequest(`/api/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update appointment.');
    }
  }

  async function checkInWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiRequest('/api/walk-ins', { method: 'POST', body: JSON.stringify({ ...walkInForm, contactPhone: walkInForm.contactPhone || null }) });
      setWalkInForm({ patientName: '', contactPhone: '', reason: '', urgency: 'medium' });
      setSuccess('Walk-in patient added to the queue.');
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to check in walk-in.');
    }
  }

  async function updateWalkIn(id: string, update: { status: string; urgency?: WalkIn['urgency']; doctorId?: string | null }) {
    try {
      await apiRequest(`/api/walk-ins/${id}`, { method: 'PATCH', body: JSON.stringify(update) });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update walk-in.');
    }
  }

  const changeSection = (next: ReceptionistSection) => { setSection(next); setSidebarOpen(false); setQuery(''); setSuccess(''); };
  const visiblePatients = data.patients.filter((patient) => `${patient.full_name ?? ''} ${patient.email} ${patient.student_number ?? ''} ${patient.staff_number ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const visibleAppointments = data.appointments.filter((appointment) => `${appointment.patient_name} ${appointment.doctor_name} ${appointment.consultation_type}`.toLowerCase().includes(query.toLowerCase()));
  const activeItem = navItems.find((item) => item.id === section);

  const appointmentRows = visibleAppointments.length ? <div className="reception-table-wrap"><table className="reception-table"><thead><tr><th>Patient</th><th>Doctor</th><th>Consultation</th><th>Start</th><th>Mode</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    {visibleAppointments.map((appointment) => <tr key={appointment.id}><td><div className="reception-person"><Avatar name={appointment.patient_name} /><strong>{appointment.patient_name}</strong></div></td><td><strong>{appointment.doctor_name}</strong><small>{appointment.specialty}</small></td><td>{appointment.consultation_type}</td><td>{formatDate(appointment.starts_at)}</td><td>{appointment.mode === 'in_person' ? 'In person' : 'Telehealth'}</td><td><span className={`reception-pill ${appointment.status}`}>{appointment.status.replace(/_/g, ' ')}</span></td><td>{appointment.status === 'pending' && <><button className="reception-primary" onClick={() => void updateStatus(appointment.id, 'confirmed')}><Check size={14} />Confirm</button><button className="reception-secondary" onClick={() => void updateStatus(appointment.id, 'cancelled')}>Cancel</button></>}</td></tr>)}
  </tbody></table></div> : <Empty>{query ? 'No appointments match your search.' : 'No appointments have been recorded.'}</Empty>;

  const content = section === 'register' ? <section className="reception-content"><div className="reception-heading"><div><h1>Invite Patient</h1><p>Create a patient profile and send an account invitation by email.</p></div></div>
    <form className="reception-form-card" onSubmit={invitePatient}><div className="reception-form-grid">
      <label>Full name<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required minLength={2} /></label>
      <label>Email address<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
      <label>Phone (international format)<input type="tel" placeholder="+27123456789" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></label>
      <label>University role<select value={form.userType} onChange={(event) => setForm({ ...form, userType: event.target.value as PatientForm['userType'] })}><option>Student</option><option>Lecturer</option><option>SPU Staff</option></select></label>
      {form.userType === 'Student' && <><label>Student number<input value={form.studentNumber} onChange={(event) => setForm({ ...form, studentNumber: event.target.value })} /></label><label>Program<input value={form.program} onChange={(event) => setForm({ ...form, program: event.target.value })} /></label></>}
      {form.userType === 'SPU Staff' && <label>Staff number<input value={form.staffNumber} onChange={(event) => setForm({ ...form, staffNumber: event.target.value })} /></label>}
      <label>Department<input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
    </div><button className="reception-primary" type="submit"><UserPlus size={16} />Send invitation</button>
    </form>
  </section>
    : section === 'patients' ? <section className="reception-content"><div className="reception-heading"><div><h1>Patients</h1><p>Registered patient account details.</p></div><button className="reception-primary" onClick={() => changeSection('register')}><Plus size={16} />Invite patient</button></div>
      <div className="reception-toolbar"><div className="reception-search"><Search size={16} /><input placeholder="Search patients" value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>
      {visiblePatients.length ? <div className="reception-table-wrap"><table className="reception-table"><thead><tr><th>Patient</th><th>University role</th><th>Email</th><th>Phone</th><th>University ID</th><th>Program / department</th></tr></thead><tbody>{visiblePatients.map((patient) => <tr key={patient.id}><td><div className="reception-person"><Avatar name={patient.full_name || patient.email} /><strong>{patient.full_name || 'Name not provided'}</strong></div></td><td>{patient.user_type || 'Not provided'}</td><td>{patient.email}</td><td>{patient.phone || 'Not provided'}</td><td>{patient.student_number || patient.staff_number || 'Not provided'}</td><td>{patient.program || patient.department || 'Not provided'}</td></tr>)}</tbody></table></div> : <Empty>{query ? 'No patients match your search.' : 'No patients have registered yet.'}</Empty>}
    </section>
    : section === 'doctors' ? <section className="reception-content"><div className="reception-heading"><div><h1>Doctors</h1><p>Active practitioners in the clinic directory.</p></div></div>
      {data.doctors.length ? <div className="reception-doctor-directory">{data.doctors.map((doctor) => <div className="reception-directory-row" key={doctor.id}><Avatar name={doctor.full_name} /><div><strong>{doctor.full_name}</strong><small>{doctor.specialty}</small></div><span>{doctor.department || 'Department not provided'}</span></div>)}</div> : <Empty>No doctors have been added to the directory.</Empty>}
    </section>
    : section === 'appointments' ? <section className="reception-content"><div className="reception-heading"><div><h1>Appointments</h1><p>Manage patient requests and recorded visits.</p></div></div><div className="reception-toolbar"><div className="reception-search"><Search size={16} /><input placeholder="Search appointments" value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>{appointmentRows}</section>
    : section === 'walkins' ? <section className="reception-content">
      <div className="reception-heading"><div><h1>Walk-in Triage</h1><p>Check patients into the queue and assign urgency or a doctor.</p></div></div>
      <form className="reception-form-card" onSubmit={checkInWalkIn}><div className="reception-form-grid">
        <label>Patient name<input value={walkInForm.patientName} onChange={(event) => setWalkInForm({ ...walkInForm, patientName: event.target.value })} required minLength={2} /></label>
        <label>Contact phone<input value={walkInForm.contactPhone} onChange={(event) => setWalkInForm({ ...walkInForm, contactPhone: event.target.value })} /></label>
        <label>Urgency<select value={walkInForm.urgency} onChange={(event) => setWalkInForm({ ...walkInForm, urgency: event.target.value as WalkIn['urgency'] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="emergency">Emergency</option></select></label>
        <label>Reason<textarea value={walkInForm.reason} onChange={(event) => setWalkInForm({ ...walkInForm, reason: event.target.value })} required maxLength={4000} /></label>
      </div><button className="reception-primary" type="submit"><Plus size={16} />Check in</button></form>
      {data.walkIns.length ? <div className="reception-table-wrap"><table className="reception-table"><thead><tr><th>Patient</th><th>Reason</th><th>Arrived</th><th>Urgency</th><th>Assign doctor</th><th>Queue status</th></tr></thead><tbody>
        {data.walkIns.map((walkIn) => <tr key={walkIn.id}><td>{walkIn.patient_name}</td><td>{walkIn.reason}</td><td>{formatDate(walkIn.arrived_at)}</td>
          <td><select value={walkIn.urgency} onChange={(event) => void updateWalkIn(walkIn.id, { status: walkIn.status, urgency: event.target.value as WalkIn['urgency'] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="emergency">Emergency</option></select></td>
          <td><select value={walkIn.assigned_doctor_id || ''} onChange={(event) => void updateWalkIn(walkIn.id, { status: 'assigned', doctorId: event.target.value || null })}><option value="">Assign doctor</option>{data.doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>)}</select></td>
          <td><select value={walkIn.status} onChange={(event) => void updateWalkIn(walkIn.id, { status: event.target.value })}><option value="waiting">Waiting</option><option value="triaged">Triaged</option><option value="assigned">Assigned</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></td>
        </tr>)}
      </tbody></table></div> : <Empty>The walk-in queue is empty.</Empty>}
    </section>
    : section === 'notifications' ? <section className="reception-content"><div className="reception-heading"><div><h1>Notifications</h1><p>Updates generated by clinic activity for your account.</p></div></div>{data.notifications.length ? data.notifications.map((notification) => <div className="reception-alert" key={notification.id}><Bell size={17} /><span><strong>{notification.title}</strong><small>{notification.message}</small></span><time>{formatDate(notification.created_at)}</time></div>) : <Empty>No notifications yet.</Empty>}</section>
    : <section className="reception-content"><div className="reception-heading"><div><h1>Reception Overview</h1><p>Current records from the clinic database.</p></div></div>
      <div className="reception-stat-grid"><div className="reception-stat red"><CalendarCheck size={23} /><div><small>Appointments</small><strong>{data.appointments.length}</strong><em>Recorded clinic visits</em></div></div><div className="reception-stat gold"><Clock3 size={23} /><div><small>Pending</small><strong>{data.appointments.filter((item) => item.status === 'pending').length}</strong><em>Awaiting confirmation</em></div></div><div className="reception-stat green"><Users size={23} /><div><small>Patients</small><strong>{data.patients.length}</strong><em>Registered accounts</em></div></div><div className="reception-stat blue"><Stethoscope size={23} /><div><small>Doctors</small><strong>{data.doctors.length}</strong><em>Active directory entries</em></div></div></div>
      <div className="reception-card"><div className="reception-card-header"><h2><Calendar size={17} />Appointments</h2><button onClick={() => changeSection('appointments')}>View all</button></div>{appointmentRows}</div>
    </section>;

  return <div className="reception-shell"><aside className={`reception-sidebar ${sidebarOpen ? 'open' : ''}`}>
    <div className="reception-logo"><span><ShieldCheck size={30} /></span><div><strong>SCCPMS</strong><small>CLINIC OPERATIONS</small></div></div>
    <nav>{navItems.map((item) => <button className={section === item.id ? 'active' : ''} key={item.id} onClick={() => changeSection(item.id)}><item.icon size={20} /><span>{item.label}</span>{section === item.id && <Check size={16} />}</button>)}</nav>
    <button className="reception-logout" onClick={signOut}><LogOut size={20} />Sign Out</button>
  </aside>
  {sidebarOpen && <div className="reception-overlay" onClick={() => setSidebarOpen(false)} />}
  <main className="reception-main"><header className="reception-topbar"><button className="reception-menu" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle menu">{sidebarOpen ? <X size={21} /> : <Menu size={21} />}</button>
    <div className="reception-top-search"><Search size={18} /><input placeholder="Search records" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    <div className="reception-top-actions"><div className="reception-date"><Calendar size={17} />{new Date().toLocaleDateString()}</div><div className="reception-user"><Avatar name={profile?.full_name || profile?.email || 'Receptionist'} /><span><strong>{profile?.full_name || profile?.email}</strong><small>Receptionist</small></span></div></div>
  </header>
  {activeItem && <div className="reception-pagebar"><div><activeItem.icon size={19} /><span>{activeItem.label}</span></div></div>}
  {error && <div className="reception-error" role="alert">{error}<button onClick={() => void refresh()}>Retry</button></div>}
  {success && <div className="reception-success-message" role="status">{success}</div>}
  {loading ? <div className="reception-content">Loading clinic records…</div> : content}
  </main></div>;
}
