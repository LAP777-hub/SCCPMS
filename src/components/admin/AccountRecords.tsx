import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/useClinicRefresh';
import { formatClinicDate } from '../../lib/clinic-time';

type Record = { id: string; full_name: string | null; email: string; phone: string | null; role: string; department: string | null; program: string | null; student_number: string | null; staff_number: string | null; deleted_at: string; reinvited_user_id: string | null; reinvited_at: string | null };
export default function AccountRecords({ timezone }: { timezone: string }) {
  const [records, setRecords] = useState<Record[]>([]);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [filters, setFilters] = useState({ q: '', role: 'all' });
  const [selected, setSelected] = useState<Record | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const result = await apiRequest<{ data: Record[] }>(`/api/account-records?${new URLSearchParams(filters)}`);
      if (current === sequence.current) { setRecords(result.data); setError(''); }
    } catch (failure) { if (current === sequence.current) setError(failure instanceof Error ? failure.message : 'Unable to load records.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [filters]);
  useLiveRefresh(load, 15_000, filters);
  useEffect(() => () => { sequence.current += 1; }, []);
  function search(event: FormEvent) { event.preventDefault(); setFilters({ q: query.trim(), role }); setLoading(true); }
  async function invite(record: Record) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await apiRequest(`/api/account-records/${record.id}/reinvite`, { method: 'POST', body: '{}' });
      setSelected(null); setNotice(`Invitation sent to ${record.email}. They can create their own password. The deleted record and original clinical history are retained.`);
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to send the invitation.'); }
    finally { setBusy(false); }
  }
  const detail = selected ? records.find(record => record.id === selected.id) ?? selected : null;
  return <section className="clinic-ops"><div className="clinic-ops-heading"><div><h1>Account Records</h1><p>Deleted doctor, patient and receptionist accounts. Original contact details and clinical identities are retained.</p></div></div>
    <form className="clinic-ops-form" onSubmit={search}><label>Search deleted accounts<input maxLength={160} value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, email, phone or identity number" /></label><label>Account role<select value={role} onChange={event => setRole(event.target.value)}><option value="all">All roles</option><option value="patient">Patients</option><option value="doctor">Doctors</option><option value="receptionist">Receptionists</option></select></label><div className="clinic-ops-actions clinic-ops-wide"><button className="primary">Search records</button><small>Showing up to 250 matching records. Narrow your search for older accounts.</small></div></form>
    {error && <p className="clinic-ops-error" role="alert">{error}</p>}{notice && <p className="clinic-ops-success" role="status">{notice}</p>}
    {detail && <article className="clinic-ops-form"><h2>{detail.full_name || detail.email}</h2><p>Role: {detail.role}</p><p>Email: <a href={`mailto:${detail.email}`}>{detail.email}</a></p><p>Phone: {detail.phone ? <a href={`tel:${detail.phone}`}>{detail.phone}</a> : 'Not recorded'}</p><p>Identity number: {detail.student_number || detail.staff_number || 'Not recorded'}</p><p>Department: {detail.department || 'Not recorded'}</p><p>Programme / specialty: {detail.program || 'Not recorded'}</p><p>Deleted: {formatClinicDate(detail.deleted_at, timezone)}</p><div className="clinic-ops-wide"><p>A new invitation creates a separate login with the recorded role. Historical clinical records stay attached to the original identity.</p>{detail.reinvited_user_id ? <p>Already reinvited {detail.reinvited_at ? formatClinicDate(detail.reinvited_at, timezone) : ''}. Manage the replacement account in its directory.</p> : <button className="clinic-ops-button primary" disabled={busy} onClick={() => void invite(detail)}>{busy ? 'Sending invitation…' : 'Invite back to system'}</button>} <button className="clinic-ops-button" disabled={busy} onClick={() => setSelected(null)}>Close record</button></div></article>}
    {loading ? <p role="status">Loading deleted account records…</p> : <div className="clinic-ops-table"><table><thead><tr><th>Account</th><th>Role</th><th>Contact</th><th>Deleted</th><th>Invitation</th><th>Actions</th></tr></thead><tbody>{records.map(record => <tr key={record.id}><td>{record.full_name || record.email}</td><td>{record.role}</td><td><a href={`mailto:${record.email}`}>{record.email}</a>{record.phone && <small><a href={`tel:${record.phone}`}>{record.phone}</a></small>}</td><td>{formatClinicDate(record.deleted_at, timezone)}</td><td>{record.reinvited_user_id ? 'Reinvited' : 'Not reinvited'}</td><td><button className="clinic-ops-button" onClick={() => setSelected(record)}>View record</button></td></tr>)}{!records.length && <tr><td colSpan={6} className="clinic-ops-empty">No deleted accounts match these filters.</td></tr>}</tbody></table></div>}
  </section>;
}
