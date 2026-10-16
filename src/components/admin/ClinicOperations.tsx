import { useEffect, useState, type FormEvent } from 'react';
import { Bell, Plus, RefreshCw } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import { clinicDate, formatClinicDate } from '../../lib/clinic-time';
import './ClinicOperations.css';

export type ClinicDoctor = { id: string; user_id?: string; full_name: string; specialty: string; department: string | null; active?: boolean };
export type ClinicPatient = { id: string; email: string; full_name: string | null; phone: string | null; user_type: string | null; student_number: string | null; staff_number: string | null; department: string | null; program: string | null; active?: boolean; deletion_requested_at?: string | null; deleted_at?: string | null; created_at: string };
export type ClinicAppointment = { id: string; patient_user_id: string; patient_name: string; doctor_id: string; doctor_name: string; specialty: string; consultation_type: string; starts_at: string; ends_at?: string; mode: string; status: string };
export type ClinicNotification = { id: string; title: string; message: string; read_at: string | null; created_at: string };
export type ClinicStaff = { id: string; email: string; full_name: string | null; phone: string | null; role: 'doctor' | 'receptionist'; department: string | null; program: string | null; active?: boolean; deletion_requested_at?: string | null; deleted_at?: string | null; doctor_id?: string | null; specialty?: string | null; doctor_active?: boolean };
type Slot = { id: string; starts_at: string; ends_at: string; status?: string };
type PatientForm = { fullName: string; phone: string; userType: 'Student' | 'Lecturer' | 'SPU Staff'; studentNumber: string; staffNumber: string; department: string; program: string; email: string };
const emptyPatient: PatientForm = { fullName: '', phone: '', userType: 'Student', studentNumber: '', staffNumber: '', department: '', program: '', email: '' };
const message = (error: unknown) => error instanceof Error ? error.message : 'The change could not be saved. Please try again.';
const canConfirm = (appointment: ClinicAppointment) => appointment.status === 'pending' && new Date(appointment.ends_at || appointment.starts_at).getTime() > Date.now();

export function PatientsView({ patients, admin = false, onSaved, initialCreate = false, initialSearch = '' }: { patients: ClinicPatient[]; admin?: boolean; onSaved: () => Promise<void>; initialCreate?: boolean; initialSearch?: string }) {
  const [query, setQuery] = useState(initialSearch);
  const [editing, setEditing] = useState<ClinicPatient | 'new' | null>(initialCreate ? 'new' : null);
  const [form, setForm] = useState(emptyPatient);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deactivating, setDeactivating] = useState<ClinicPatient | null>(null);
  const [deleting, setDeleting] = useState<ClinicPatient | null>(null);
  const [deletionStates, setDeletionStates] = useState<Record<string, 'pending' | 'deleted'>>({});
  const deletionPending = (patient: ClinicPatient) => !!patient.deletion_requested_at || deletionStates[patient.id] === 'pending';
  const visible = patients.filter((patient) => !patient.deleted_at && deletionStates[patient.id] !== 'deleted' && `${patient.full_name ?? ''} ${patient.email} ${patient.student_number ?? ''} ${patient.staff_number ?? ''}`.toLowerCase().includes(query.toLowerCase()));

  function edit(patient: ClinicPatient | 'new') {
    if (busy || (patient !== 'new' && deletionPending(patient))) return;
    setEditing(patient); setDeactivating(null); setDeleting(null); setError(''); setSuccess('');
    setForm(patient === 'new' ? emptyPatient : { fullName: patient.full_name || '', email: patient.email, phone: patient.phone || '', userType: (patient.user_type || 'Student') as PatientForm['userType'], studentNumber: patient.student_number || '', staffNumber: patient.staff_number || '', department: patient.department || '', program: patient.program || '' });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing || busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const fields = { fullName: form.fullName, phone: form.phone.replace(/[\s()-]/g, ''), userType: form.userType, studentNumber: form.userType === 'Student' ? form.studentNumber || null : null, staffNumber: form.userType !== 'Student' ? form.staffNumber || null : null, department: form.department || null, program: form.program || null };
      await apiRequest(editing === 'new' ? '/api/patients' : `/api/patients/${editing.id}`, { method: editing === 'new' ? 'POST' : 'PATCH', body: JSON.stringify(editing === 'new' ? { ...fields, email: form.email } : fields) });
      setEditing(null); setSuccess(editing === 'new' ? 'Patient saved. Their account invitation has been sent.' : 'Patient details updated.');
      await onSaved();
    } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  }

  async function setActive(patient: ClinicPatient, active: boolean) {
    if (busy || deletionPending(patient) || patient.deleted_at) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await apiRequest(`/api/patients/${patient.id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
      setDeactivating(null); setSuccess(active ? 'Patient account reactivated.' : 'Patient account deactivated. Medical and appointment records are retained.');
      await onSaved();
    } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  }

  async function deleteAccount(patient: ClinicPatient) {
    if (busy || !admin || patient.active !== false) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await apiRequest(`/api/patients/${patient.id}`, { method: 'DELETE' });
      setDeletionStates(current => ({ ...current, [patient.id]: 'deleted' }));
      setDeleting(null); setEditing(null);
      setSuccess('Patient login account deleted. Medical records, appointment history and audit records are retained.');
      await onSaved();
    } catch (requestError) {
      setError(message(requestError));
      if (requestError instanceof ApiError && requestError.code === 'PATIENT_DELETION_PENDING') {
        setDeletionStates(current => ({ ...current, [patient.id]: 'pending' }));
      }
      // A committed deletion request can outlive a failed provider call. Reload
      // its state so Reactivate disappears and the administrator can retry.
      await onSaved().catch(() => undefined);
    } finally { setBusy(false); }
  }

  return <section className="clinic-ops"><div className="clinic-ops-heading"><div><h1>Patients</h1><p>Register patients and manage their university and contact details.</p></div><button className="clinic-ops-button primary" disabled={busy} onClick={() => edit('new')}><Plus size={16} />Register patient</button></div>
    {error && <p className="clinic-ops-error" role="alert">{error}</p>}{success && <p className="clinic-ops-success" role="status">{success}</p>}
    {editing && <form className="clinic-ops-form" onSubmit={save}><h2>{editing === 'new' ? 'Register and invite patient' : 'Edit patient details'}</h2>
      <label>Full name<input required minLength={2} maxLength={160} value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
      <label>Email<input type="email" required disabled={editing !== 'new'} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Phone in international format<input type="tel" required pattern="\+[1-9][0-9]{7,14}" title="Use international format, beginning with + and a country code." value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
      <label>University role<select value={form.userType} onChange={(event) => setForm({ ...form, userType: event.target.value as PatientForm['userType'] })}><option>Student</option><option>Lecturer</option><option>SPU Staff</option></select></label>
      {form.userType === 'Student' ? <><label>Student number<input required value={form.studentNumber} onChange={(event) => setForm({ ...form, studentNumber: event.target.value })} /></label><label>Program<input value={form.program} onChange={(event) => setForm({ ...form, program: event.target.value })} /></label></> : <label>Staff number<input required value={form.staffNumber} onChange={(event) => setForm({ ...form, staffNumber: event.target.value })} /></label>}
      <label>Department<input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
      <div className="clinic-ops-actions clinic-ops-wide"><button className="primary" disabled={busy}>{busy ? 'Saving…' : editing === 'new' ? 'Save and send invitation' : 'Save changes'}</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
    {deactivating && <div className="clinic-ops-delete-confirm"><span>Deactivate {deactivating.full_name || deactivating.email}? This removes login access and retains their medical history.</span><div className="clinic-ops-actions"><button className="danger" disabled={busy} onClick={() => void setActive(deactivating, false)}>Deactivate account</button><button disabled={busy} onClick={() => setDeactivating(null)}>Keep account</button></div></div>}
    {deleting && <div className="clinic-ops-form" role="group" aria-labelledby="patient-delete-title"><h2 id="patient-delete-title">{deletionPending(deleting) ? 'Finish patient deletion' : 'Delete patient account'}</h2><p className="clinic-ops-wide">Delete the login account for {deleting.full_name || deleting.email} ({deleting.email}) permanently? Their login credentials will be removed and their account will disappear from the patient directory. Medical records, appointment history and audit records will remain accessible to authorized clinic staff. This account cannot be reactivated after deletion starts.</p><div className="clinic-ops-actions clinic-ops-wide"><button className="danger" disabled={busy} onClick={() => void deleteAccount(deleting)}>{busy ? 'Deleting…' : deletionPending(deleting) ? 'Retry deletion' : 'Delete permanently'}</button><button disabled={busy} onClick={() => setDeleting(null)}>Keep account</button></div></div>}
    <label className="clinic-ops-form">Search patients<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="clinic-ops-table"><table><thead><tr><th>Patient</th><th>University details</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((patient) => <tr key={patient.id}><td>{patient.full_name || patient.email}<small>{patient.email}</small></td><td>{patient.user_type || 'Not recorded'}<small>{patient.student_number || patient.staff_number || 'University ID not recorded'}</small><small>{patient.department || patient.program}</small></td><td>{patient.phone || 'Not recorded'}</td><td>{deletionPending(patient) ? 'Deletion pending' : patient.active === false ? 'Inactive' : 'Active'}</td><td><div className="clinic-ops-actions"><button disabled={busy || deletionPending(patient)} onClick={() => edit(patient)}>Edit</button>{admin && (deletionPending(patient) ? <button className="danger" disabled={busy} onClick={() => { setEditing(null); setDeactivating(null); setDeleting(patient); }}>Retry deletion</button> : patient.active === false ? <><button disabled={busy} onClick={() => void setActive(patient, true)}>Reactivate</button><button className="danger" disabled={busy} onClick={() => { setEditing(null); setDeactivating(null); setDeleting(patient); }}>Delete account</button></> : <button className="danger" disabled={busy} onClick={() => { setDeleting(null); setDeactivating(patient); }}>Deactivate</button>)}</div></td></tr>)}{!visible.length && <tr><td colSpan={5} className="clinic-ops-empty">{query ? 'No patients match your search.' : 'No patient accounts have been registered.'}</td></tr>}</tbody></table></div>
  </section>;
}

export function AppointmentBooking({ doctors, patients, appointment, timezone, onSaved, onClose }: { doctors: ClinicDoctor[]; patients: ClinicPatient[]; appointment?: ClinicAppointment; timezone: string; onSaved: () => Promise<void>; onClose: () => void }) {
  const [doctorId, setDoctorId] = useState(appointment?.doctor_id || '');
  const [date, setDate] = useState('');
  const [slotId, setSlotId] = useState('');
  const [patientId, setPatientId] = useState(appointment?.patient_user_id || '');
  const [consultationType, setConsultationType] = useState(appointment?.consultation_type || '');
  const [mode, setMode] = useState(appointment?.mode || 'in_person');
  const [reason, setReason] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState('');
  const [slotError, setSlotError] = useState('');
  useEffect(() => {
    setSlotId(''); setSlots([]); setSlotError('');
    if (!doctorId || !date) return;
    let active = true;
    let sequence = 0;
    async function load() {
      const request = ++sequence;
      setLoadingSlots(true);
      try {
        const result = await apiRequest<{ data: Slot[] }>(`/api/doctors/${doctorId}/availability?date=${date}`);
        if (active && request === sequence) { const available = result.data.filter((slot) => new Date(slot.starts_at).getTime() > Date.now()); setSlots(available); setSlotId((selected) => available.some((slot) => slot.id === selected) ? selected : ''); setSlotError(''); }
      } catch (requestError) { if (active && request === sequence) { setSlotError(message(requestError)); setSlots([]); setSlotId(''); } } finally { if (active && request === sequence) setLoadingSlots(false); }
    }
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15_000);
    const invalidate = () => { void load(); };
    window.addEventListener('clinic:data-changed', invalidate);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('clinic:data-changed', invalidate); };
  }, [doctorId, date]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await apiRequest(appointment ? `/api/appointments/${appointment.id}/reschedule` : '/api/appointments', { method: 'POST', body: JSON.stringify(appointment ? { slotId } : { slotId, patientUserId: patientId, consultationType, mode, reason: reason || null }) });
      await onSaved(); onClose();
    } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  }

  return <form className="clinic-ops-form" onSubmit={save}><h2>{appointment ? `Reschedule ${appointment.patient_name}` : 'Schedule an appointment'}</h2><p className="clinic-ops-wide clinic-ops-muted">Appointment dates and times use {timezone}. Available times refresh automatically.</p>
    {error && <p className="clinic-ops-error clinic-ops-wide" role="alert">{error}</p>}
    {slotError && <p className="clinic-ops-error clinic-ops-wide" role="alert">{slotError}</p>}
    {!appointment && <label>Patient<select value={patientId} onChange={(event) => setPatientId(event.target.value)} required><option value="">Choose patient</option>{patients.filter((patient) => patient.active !== false).map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name || patient.email} · {patient.student_number || patient.staff_number || patient.email}</option>)}</select></label>}
    <label>Doctor<select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required><option value="">Choose doctor</option>{doctors.filter((doctor) => doctor.active !== false).map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name} · {doctor.specialty}</option>)}</select></label>
    <label>Date<input type="date" required min={clinicDate(new Date(), timezone)} value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label>Available time<select required disabled={!doctorId || !date || loadingSlots || !slots.length} value={slotId} onChange={(event) => setSlotId(event.target.value)}><option value="">{loadingSlots ? 'Loading available times…' : doctorId && date && !slots.length ? 'No available times on this date' : 'Choose an available time'}</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>{formatClinicDate(slot.starts_at, timezone)}</option>)}</select></label>
    {!appointment && <><label>Consultation type<input required minLength={2} maxLength={120} value={consultationType} onChange={(event) => setConsultationType(event.target.value)} /></label><label>Mode<select value={mode} onChange={(event) => setMode(event.target.value)}><option value="in_person">In person</option><option value="telehealth">Telehealth</option></select></label><label className="clinic-ops-wide">Reason for visit<textarea maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label></>}
    <div className="clinic-ops-actions clinic-ops-wide"><button className="primary" disabled={busy || !slotId}>{busy ? 'Saving…' : appointment ? 'Reschedule appointment' : 'Book appointment'}</button><button type="button" disabled={busy} onClick={onClose}>Cancel</button></div>
  </form>;
}

export function AppointmentsView({ appointments, doctors, patients, timezone = 'Africa/Johannesburg', onSaved, initialCreate = false, initialSearch = '' }: { appointments: ClinicAppointment[]; doctors: ClinicDoctor[]; patients: ClinicPatient[]; timezone?: string; onSaved: () => Promise<void>; initialCreate?: boolean; initialSearch?: string }) {
  const [booking, setBooking] = useState<ClinicAppointment | 'new' | null>(initialCreate ? 'new' : null);
  const [query, setQuery] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<ClinicAppointment | null>(null);
  const visible = appointments.filter((appointment) => (!statusFilter || appointment.status === statusFilter) && `${appointment.patient_name} ${appointment.doctor_name} ${appointment.consultation_type}`.toLowerCase().includes(query.toLowerCase()));
  async function status(appointment: ClinicAppointment, next: string) {
    setBusy(true); setError('');
    try { await apiRequest(`/api/appointments/${appointment.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); setCancelling(null); await onSaved(); } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  }
  return <section className="clinic-ops"><div className="clinic-ops-heading"><div><h1>Appointments</h1><p>Schedule, confirm and manage clinic appointments. Times use {timezone}.</p></div><button className="clinic-ops-button primary" onClick={() => setBooking('new')}><Plus size={16} />Book appointment</button></div>
    {error && <p className="clinic-ops-error" role="alert">{error}</p>}
    {booking && <AppointmentBooking key={booking === 'new' ? 'new' : booking.id} doctors={doctors} patients={patients} appointment={booking === 'new' ? undefined : booking} timezone={timezone} onSaved={onSaved} onClose={() => setBooking(null)} />}
    {cancelling && <div className="clinic-ops-delete-confirm"><span>Cancel {cancelling.patient_name}'s appointment with {cancelling.doctor_name} on {formatClinicDate(cancelling.starts_at, timezone)}?</span><div className="clinic-ops-actions"><button className="danger" disabled={busy} onClick={() => void status(cancelling, 'cancelled')}>Cancel appointment</button><button disabled={busy} onClick={() => setCancelling(null)}>Keep appointment</button></div></div>}
    <div className="clinic-ops-form"><label>Search<input value={query} onChange={(event) => setQuery(event.target.value)} /></label><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'].map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}</select></label></div>
    <div className="clinic-ops-table"><table><thead><tr><th>Patient</th><th>Doctor</th><th>Consultation</th><th>Start</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((appointment) => <tr key={appointment.id}><td>{appointment.patient_name}</td><td>{appointment.doctor_name}<small>{appointment.specialty}</small></td><td>{appointment.consultation_type}<small>{appointment.mode === 'in_person' ? 'In person' : 'Telehealth'}</small></td><td>{formatClinicDate(appointment.starts_at, timezone)}</td><td>{appointment.status.replace(/_/g, ' ')}</td><td><div className="clinic-ops-actions">{canConfirm(appointment) && <button disabled={busy} onClick={() => void status(appointment, 'confirmed')}>Confirm</button>}{['pending', 'confirmed'].includes(appointment.status) && <><button disabled={busy} onClick={() => setBooking(appointment)}>Reschedule</button><button className="danger" disabled={busy} onClick={() => setCancelling(appointment)}>Cancel</button></>}</div></td></tr>)}{!visible.length && <tr><td colSpan={6} className="clinic-ops-empty">{appointments.length ? 'No appointments match these filters.' : 'No appointments have been recorded.'}</td></tr>}</tbody></table></div>
  </section>;
}

export function NotificationsView({ notifications, onSaved, timezone = 'Africa/Johannesburg' }: { notifications: ClinicNotification[]; onSaved: () => Promise<void>; timezone?: string }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function change(path: string, method: string) {
    setBusy(true); setError('');
    try { await apiRequest(path, { method }); await onSaved(); } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  }
  return <section className="clinic-ops"><div className="clinic-ops-heading"><div><h1>Notifications</h1><p>Updates generated by clinic activity for your account.</p></div><button className="clinic-ops-button" disabled={busy || !notifications.some((notification) => !notification.read_at)} onClick={() => void change('/api/notifications/read-all', 'POST')}>Mark all read</button></div>{error && <p className="clinic-ops-error" role="alert">{error}</p>}{notifications.map((notification) => <article className={`clinic-ops-notification ${notification.read_at ? '' : 'unread'}`} key={notification.id}><Bell size={20} /><div><strong>{notification.title}</strong><p>{notification.message}</p><time className="clinic-ops-muted">{formatClinicDate(notification.created_at, timezone)}</time></div><div className="clinic-ops-actions">{!notification.read_at && <button disabled={busy} onClick={() => void change(`/api/notifications/${notification.id}/read`, 'PATCH')}>Mark read</button>}<button disabled={busy} onClick={() => void change(`/api/notifications/${notification.id}`, 'DELETE')}>Delete</button></div></article>)}{!notifications.length && <p className="clinic-ops-empty">No notifications yet.</p>}</section>;
}

export function RefreshButton({ refresh }: { refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return <button className="clinic-ops-button" disabled={busy} onClick={async () => { setBusy(true); try { await refresh(); } finally { setBusy(false); } }}><RefreshCw size={16} />{busy ? 'Refreshing…' : 'Refresh'}</button>;
}
