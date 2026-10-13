import { useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { formatClinicDate } from '../../lib/clinic-time';
import { useLiveRefresh } from '../../lib/useClinicRefresh';

type AuditEvent = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};
export default function AuditLog({
  names,
  timezone,
}: {
  names: Map<string, string>;
  timezone: string;
}) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [kind, setKind] = useState('operations');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const cursorId = useRef<string | null>(null);
  const filter = useRef(kind);
  filter.current = kind;
  const initialized = useRef(false);
  async function load(older = false) {
    const selected = filter.current;
    setBusy(true);
    try {
      const params = new URLSearchParams({ kind: selected, limit: '100' });
      if (older && cursor) {
        params.set('before', cursor);
        if (cursorId.current) params.set('beforeId', cursorId.current);
      }
      const result = await apiRequest<{
        data: AuditEvent[];
        before: string | null;
        beforeId: string | null;
      }>(`/api/audit-events?${params}`);
      if (selected !== filter.current) return;
      setEvents(current =>
        [...new Map([...result.data, ...current].map(event => [event.id, event])).values()].sort(
          (a, b) => b.created_at.localeCompare(a.created_at)
        )
      );
      if (older || !initialized.current) {
        setCursor(result.before);
        cursorId.current = result.beforeId;
      }
      initialized.current = true;
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to load audit records.');
    } finally {
      setBusy(false);
    }
  }
  useLiveRefresh(() => load());
  function changeKind(value: string) {
    filter.current = value;
    setKind(value);
    setEvents([]);
    setCursor(null);
    initialized.current = false;
    void load();
  }
  return (
    <section className="clinic-ops">
      <h1>Audit Log</h1>
      <p>
        Stored clinical, account and API activity. Patient content and verification codes are
        excluded from access logs.
      </p>
      <label>
        Record category
        <select
          className="clinic-ops-select"
          value={kind}
          onChange={event => changeKind(event.target.value)}
        >
          <option value="operations">Account & clinical actions</option>
          <option value="access">API access</option>
          <option value="all">All records</option>
        </select>
      </label>
      {error && (
        <p className="clinic-ops-error" role="alert">
          {error}
        </p>
      )}
      <div className="clinic-ops-table">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Record</th>
            </tr>
          </thead>
          <tbody>
            {events.map(event => (
              <tr key={event.id}>
                <td>{formatClinicDate(event.created_at, timezone)}</td>
                <td>
                  {event.actor_user_id
                    ? names.get(event.actor_user_id) || event.actor_user_id
                    : 'Unauthenticated request'}
                </td>
                <td>{event.action}</td>
                <td>
                  {event.entity_type}
                  <small>{event.entity_id}</small>
                </td>
              </tr>
            ))}
            {!events.length && (
              <tr>
                <td colSpan={4}>
                  {busy ? 'Loading audit records…' : 'No matching audit records.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        className="clinic-ops-button"
        disabled={busy || !cursor}
        onClick={() => void load(true)}
      >
        Load older records
      </button>
    </section>
  );
}
