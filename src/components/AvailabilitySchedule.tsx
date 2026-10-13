import { useState, type FormEvent } from 'react';
import { apiRequest } from '../lib/api';
import { clinicDate, clinicTimeToIso, formatClinicDate } from '../lib/clinic-time';
import { useLiveRefresh } from '../lib/useClinicRefresh';
import type { ClinicDoctor } from './admin/ClinicOperations';

type Slot = {
  id: string;
  doctor_id: string;
  doctor_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
};
export default function AvailabilitySchedule({
  doctors,
  timezone,
}: {
  doctors: ClinicDoctor[];
  timezone: string;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const result = await apiRequest<{ data: Slot[] }>('/api/availability-slots');
      setSlots(result.data);
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to load doctor schedules.');
    }
  }
  useLiveRefresh(refresh);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const fields = new FormData(event.currentTarget);
    try {
      const startsAt = clinicTimeToIso(date, String(fields.get('time')), timezone);
      const endsAt = new Date(
        new Date(startsAt).getTime() + Number(fields.get('duration')) * 60000
      ).toISOString();
      await apiRequest('/api/availability-slots', {
        method: 'POST',
        body: JSON.stringify({ doctorId, startsAt, endsAt }),
      });
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to create availability.');
    } finally {
      setBusy(false);
    }
  }
  async function change(slot: Slot, remove = false) {
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/api/availability-slots/${slot.id}`, {
        method: remove ? 'DELETE' : 'PATCH',
        ...(remove
          ? {}
          : {
              body: JSON.stringify({ status: slot.status === 'blocked' ? 'available' : 'blocked' }),
            }),
      });
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to update availability.');
    } finally {
      setBusy(false);
    }
  }
  const visible = slots.filter(
    slot =>
      (!doctorId || slot.doctor_id === doctorId) &&
      (!date || clinicDate(slot.starts_at, timezone) === date)
  );
  return (
    <section className="clinic-ops">
      <h1>Doctor Schedules</h1>
      <p>
        Create availability within clinic hours. Booked slots remain attached to their appointments.
        Times use {timezone}.
      </p>
      <form className="clinic-ops-form" onSubmit={create}>
        <label>
          Doctor
          <select required value={doctorId} onChange={event => setDoctorId(event.target.value)}>
            <option value="">Select doctor</option>
            {doctors.map(doctor => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Schedule date
          <input
            type="date"
            required
            min={clinicDate(new Date(), timezone)}
            value={date}
            onChange={event => setDate(event.target.value)}
          />
        </label>
        <label>
          Start time
          <input name="time" type="time" required />
        </label>
        <label>
          Duration (minutes)
          <input name="duration" type="number" min={10} max={30} defaultValue={30} required />
        </label>
        <button className="primary" disabled={busy || !doctors.length}>
          Add availability
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
              <th>Doctor</th>
              <th>Start</th>
              <th>End</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(slot => (
              <tr key={slot.id}>
                <td>{slot.doctor_name}</td>
                <td>{formatClinicDate(slot.starts_at, timezone)}</td>
                <td>{formatClinicDate(slot.ends_at, timezone)}</td>
                <td>{slot.status}</td>
                <td>
                  {slot.status !== 'booked' && (
                    <div className="clinic-ops-actions">
                      <button disabled={busy} onClick={() => void change(slot)}>
                        {slot.status === 'blocked' ? 'Enable' : 'Block'}
                      </button>
                      <button disabled={busy} onClick={() => void change(slot, true)}>
                        Delete unused slot
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={5}>No availability matches this schedule.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
