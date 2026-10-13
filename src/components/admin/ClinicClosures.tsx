import { useState, type FormEvent } from 'react';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/useClinicRefresh';

type Closure = { holiday_date: string; title: string };
export default function ClinicClosures() {
  const [closures, setClosures] = useState<Closure[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const result = await apiRequest<{ data: Closure[] }>('/api/clinic/holidays');
      setClosures(result.data);
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to load clinic closures.');
    }
  }
  useLiveRefresh(refresh);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/clinic/holidays', {
        method: 'POST',
        body: JSON.stringify({ date: fields.get('date'), title: fields.get('title') }),
      });
      form.reset();
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save closure.');
    } finally {
      setBusy(false);
    }
  }
  async function remove(date: string) {
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/api/clinic/holidays/${date}`, { method: 'DELETE' });
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to remove closure.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="clinic-ops">
      <h2>Clinic closures & holidays</h2>
      <p>
        Booking is unavailable on these dates. Existing appointments must be handled before adding a
        closure.
      </p>
      <form className="clinic-ops-form" onSubmit={save}>
        <label>
          Closure date
          <input type="date" name="date" required />
        </label>
        <label>
          Reason
          <input name="title" required minLength={2} maxLength={160} />
        </label>
        <button className="primary" disabled={busy}>
          Save closure
        </button>
      </form>
      {error && (
        <p className="clinic-ops-error" role="alert">
          {error}
        </p>
      )}
      <div className="clinic-ops-table">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reason</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {closures.map(item => (
              <tr key={item.holiday_date}>
                <td>{item.holiday_date}</td>
                <td>{item.title}</td>
                <td>
                  <button
                    className="clinic-ops-button"
                    disabled={busy}
                    onClick={() => void remove(item.holiday_date)}
                  >
                    Remove closure
                  </button>
                </td>
              </tr>
            ))}
            {!closures.length && (
              <tr>
                <td colSpan={3}>No clinic closures recorded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
