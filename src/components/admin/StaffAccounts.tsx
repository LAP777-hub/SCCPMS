import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import type { ClinicStaff } from './ClinicOperations';

type Props = {
  staff: ClinicStaff[];
  onSaved: () => Promise<void>;
  onInvite: (role: 'doctor' | 'receptionist') => void;
  initialSearch?: string;
};
const message = (error: unknown) => error instanceof Error ? error.message : 'Unable to save this change.';

export default function StaffAccounts({ staff, onSaved, onInvite, initialSearch = '' }: Props) {
  const [query, setQuery] = useState(initialSearch);
  const [editing, setEditing] = useState<ClinicStaff | null>(null);
  const [deactivating, setDeactivating] = useState<ClinicStaff | null>(null);
  const [deleting, setDeleting] = useState<ClinicStaff | null>(null);
  const [deletionStates, setDeletionStates] = useState<Record<string, 'pending' | 'deleted'>>({});
  const [form, setForm] = useState({ fullName: '', phone: '', department: '', specialty: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const pending = (member: ClinicStaff) => Boolean(member.deletion_requested_at || deletionStates[member.id] === 'pending');
  const visible = staff.filter(member => !member.deleted_at && deletionStates[member.id] !== 'deleted'
    && `${member.full_name ?? ''} ${member.email} ${member.role} ${member.department ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));

  function edit(member: ClinicStaff) {
    if (busy || pending(member) || member.deleted_at) return;
    setEditing(member); setDeactivating(null); setDeleting(null); setError(''); setSuccess('');
    setForm({ fullName: member.full_name || '', phone: member.phone || '', department: member.role === 'receptionist' ? 'Reception / Front desk' : member.department || '', specialty: member.specialty || member.program || '' });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy || pending(editing)) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await apiRequest(`/api/staff/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ fullName: form.fullName, phone: form.phone.replace(/[\s()-]/g, ''), department: form.department || null, ...(editing.role === 'doctor' ? { specialty: form.specialty } : {}) }) });
      setEditing(null); setSuccess('Staff details updated.'); await onSaved();
    } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  }
  async function activate(member: ClinicStaff, active: boolean) {
    if (busy || pending(member) || member.deleted_at) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await apiRequest(`/api/staff/${member.id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
      setDeactivating(null); setSuccess(active ? 'Staff account reactivated.' : 'Staff account deactivated. Existing clinic records are retained.'); await onSaved();
    } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  }
  async function deleteAccount(member: ClinicStaff) {
    if (busy || member.active !== false || member.deleted_at) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await apiRequest(`/api/staff/${member.id}`, { method: 'DELETE' });
      setDeletionStates(current => ({ ...current, [member.id]: 'deleted' }));
      setDeleting(null); setEditing(null); setDeactivating(null);
      setSuccess('Staff login account deleted. Clinic, appointment and audit history are retained in Records.');
      await onSaved();
    } catch (requestError) {
      setError(message(requestError));
      if (requestError instanceof ApiError && ['STAFF_DELETION_PENDING', 'ACCOUNT_DELETION_PENDING'].includes(requestError.code ?? '')) {
        setDeletionStates(current => ({ ...current, [member.id]: 'pending' }));
      }
      await onSaved().catch(() => undefined);
    } finally { setBusy(false); }
  }
  async function setDirectoryActive(member: ClinicStaff, active: boolean) {
    if (busy || !member.doctor_id || pending(member) || member.deleted_at || member.active === false) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await apiRequest(`/api/doctors/${member.doctor_id}`, { method: active ? 'PATCH' : 'DELETE', ...(active ? { body: JSON.stringify({ active: true }) } : {}) });
      setSuccess(active ? 'Doctor added to the booking directory.' : 'Doctor removed from the booking directory.'); await onSaved();
    } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  }

  return <section className="clinic-ops">
    <div className="clinic-ops-heading"><div><h1>Doctors &amp; Staff</h1><p>Invite staff and manage account access and the booking directory.</p></div><div className="clinic-ops-actions"><button className="primary" disabled={busy} onClick={() => onInvite('doctor')}><Plus size={16} />Invite doctor</button><button disabled={busy} onClick={() => onInvite('receptionist')}><Plus size={16} />Invite receptionist</button></div></div>
    {error && <p className="clinic-ops-error" role="alert">{error}</p>}{success && <p className="clinic-ops-success" role="status">{success}</p>}
    {editing && <form className="clinic-ops-form" onSubmit={save}><h2>Edit {editing.role}</h2><label>Full name<input required minLength={2} maxLength={160} value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} /></label><label>Phone in international format<input type="tel" required pattern="\+[1-9][0-9]{7,14}" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label><label>Department{editing.role === 'receptionist' ? <select value="Reception / Front desk" disabled><option>Reception / Front desk</option></select> : <input maxLength={120} value={form.department} onChange={event => setForm({ ...form, department: event.target.value })} />}</label>{editing.role === 'doctor' && <label>Specialty<input required minLength={2} maxLength={120} value={form.specialty} onChange={event => setForm({ ...form, specialty: event.target.value })} /></label>}<div className="clinic-ops-actions clinic-ops-wide"><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div></form>}
    {deactivating && <div className="clinic-ops-delete-confirm"><span>Deactivate {deactivating.full_name || deactivating.email}? This removes account access and booking availability while keeping clinic records.</span><div className="clinic-ops-actions"><button className="danger" disabled={busy} onClick={() => void activate(deactivating, false)}>Deactivate account</button><button disabled={busy} onClick={() => setDeactivating(null)}>Keep account</button></div></div>}
    {deleting && <div className="clinic-ops-form" role="group" aria-labelledby="staff-delete-title"><h2 id="staff-delete-title">{pending(deleting) ? 'Finish staff deletion' : `Delete ${deleting.role} account`}</h2><p className="clinic-ops-wide">Permanently delete the login account for {deleting.full_name || deleting.email} ({deleting.email})? Login credentials will be removed. Clinic records, appointment history and audit records remain in Records. This account cannot be reactivated after deletion starts. A later invitation creates a separate login account.</p><div className="clinic-ops-actions clinic-ops-wide"><button className="danger" disabled={busy} onClick={() => void deleteAccount(deleting)}>{busy ? 'Deleting…' : pending(deleting) ? 'Retry deletion' : 'Delete permanently'}</button><button disabled={busy} onClick={() => setDeleting(null)}>Keep account</button></div></div>}
    <label className="clinic-ops-form">Search staff<input value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="clinic-ops-table"><table><thead><tr><th>Staff member</th><th>Role &amp; department</th><th>Contact</th><th>Account</th><th>Booking directory</th><th>Actions</th></tr></thead><tbody>{visible.map(member => <tr key={member.id}>
      <td>{member.full_name || member.email}<small>{member.email}</small></td><td>{member.role}<small>{member.specialty || member.department || 'Not recorded'}</small></td><td>{member.phone || 'Not recorded'}</td><td>{pending(member) ? 'Deletion pending' : member.active === false ? 'Inactive' : 'Active'}</td><td>{member.role === 'doctor' ? member.doctor_active ? 'Available for booking' : 'Inactive' : '—'}</td>
      <td><div className="clinic-ops-actions"><button disabled={busy || pending(member)} onClick={() => edit(member)}>Edit</button>{pending(member) ? <button className="danger" disabled={busy} onClick={() => { setEditing(null); setDeactivating(null); setDeleting(member); }}>Retry deletion</button> : member.active === false ? <><button disabled={busy} onClick={() => void activate(member, true)}>Reactivate</button><button className="danger" disabled={busy} onClick={() => { setEditing(null); setDeactivating(null); setDeleting(member); }}>Delete account</button></> : <button className="danger" disabled={busy} onClick={() => { setEditing(null); setDeleting(null); setDeactivating(member); }}>Deactivate</button>}{member.role === 'doctor' && member.doctor_id && member.active !== false && !pending(member) && <button disabled={busy} onClick={() => void setDirectoryActive(member, !member.doctor_active)}>{member.doctor_active ? 'Remove from booking' : 'Enable booking'}</button>}</div></td>
    </tr>)}{!visible.length && <tr><td colSpan={6} className="clinic-ops-empty">{query ? 'No staff match your search.' : 'No doctors or receptionists have been invited.'}</td></tr>}</tbody></table></div>
  </section>;
}
