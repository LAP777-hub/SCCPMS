import { useState, type FormEvent } from 'react';
import { apiRequest } from '../lib/api';
import { campusTimezone, clinicDateTime, requestMessage } from '../lib/dashboardTime';

export type ClinicalVisit = {
  id: string;
  appointment_id: string;
  patient_user_id: string;
  visit_date: string;
  chief_complaint: string;
  history: string | null;
  examination: string | null;
  assessment: string | null;
  plan: string | null;
  temperature_c: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  weight_kg: number | null;
};

export type ClinicalPrescription = {
  id: string;
  visit_id: string;
  medication: string;
  dosage: string;
  route: string | null;
  frequency: string;
  duration: string;
  quantity: string | null;
  instructions: string | null;
  status: string;
  created_at: string;
};

export type ClinicalLab = {
  id: string;
  visit_id: string;
  test_name: string;
  clinical_indication: string | null;
  status: string;
  result_summary: string | null;
  resulted_at: string | null;
};

const vitalFields = [
  {
    field: 'temperatureC',
    key: 'temperature_c',
    label: 'Temperature (°C)',
    min: 25,
    max: 45,
    step: 0.1,
  },
  {
    field: 'bloodPressureSystolic',
    key: 'blood_pressure_systolic',
    label: 'Systolic BP (mmHg)',
    min: 40,
    max: 300,
    step: 1,
  },
  {
    field: 'bloodPressureDiastolic',
    key: 'blood_pressure_diastolic',
    label: 'Diastolic BP (mmHg)',
    min: 20,
    max: 200,
    step: 1,
  },
  { field: 'heartRate', key: 'heart_rate', label: 'Heart rate (bpm)', min: 20, max: 250, step: 1 },
  {
    field: 'respiratoryRate',
    key: 'respiratory_rate',
    label: 'Respiratory rate (/min)',
    min: 5,
    max: 80,
    step: 1,
  },
  {
    field: 'oxygenSaturation',
    key: 'oxygen_saturation',
    label: 'Oxygen saturation (%)',
    min: 0,
    max: 100,
    step: 0.1,
  },
  { field: 'weightKg', key: 'weight_kg', label: 'Weight (kg)', min: 0.01, max: 1000, step: 0.01 },
] as const;

function LabResultForm({
  order,
  busy,
  onUpdate,
  timezone,
}: {
  order: ClinicalLab;
  busy: boolean;
  onUpdate: (id: string, status: string, resultSummary?: string) => Promise<void>;
  timezone: string;
}) {
  const [status, setStatus] = useState(
    order.status === 'ordered'
      ? 'collected'
      : order.status === 'collected'
        ? 'processing'
        : 'resulted'
  );
  const [summary, setSummary] = useState(order.result_summary ?? '');
  const terminal = ['resulted', 'cancelled'].includes(order.status);
  const allowed =
    order.status === 'ordered'
      ? ['collected', 'cancelled']
      : order.status === 'collected'
        ? ['processing', 'resulted', 'cancelled']
        : ['resulted', 'cancelled'];
  return (
    <article className="doctor-record-entry">
      <h4>{order.test_name}</h4>
      <p>Status: {order.status}</p>
      {order.clinical_indication && <p>Indication: {order.clinical_indication}</p>}
      {order.result_summary && <p>Result: {order.result_summary}</p>}
      {order.resulted_at && <small>Recorded {clinicDateTime(order.resulted_at, timezone)}</small>}
      {!terminal && (
        <form
          className="doctor-form-grid"
          onSubmit={event => {
            event.preventDefault();
            void onUpdate(order.id, status, status === 'resulted' ? summary : undefined);
          }}
        >
          <label>
            Status
            <select value={status} onChange={event => setStatus(event.target.value)}>
              {allowed.map(value => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {status === 'resulted' && (
            <label className="doctor-full-field">
              Laboratory result
              <textarea
                value={summary}
                onChange={event => setSummary(event.target.value)}
                required
                maxLength={10000}
              />
            </label>
          )}
          <button className="doctor-btn-secondary" disabled={busy}>
            Save laboratory update
          </button>
        </form>
      )}
    </article>
  );
}

function VisitCorrections({ visitId, timezone }: { visitId: string; timezone: string }) {
  type Revision = { id: string; created_at: string; previous_record: Record<string,unknown>; revised_record: Record<string,unknown> };
  const [revisions,setRevisions] = useState<Revision[] | null>(null);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(false);
  async function load() {
    setLoading(true); setError('');
    try { const result = await apiRequest<{data:Revision[]}>(`/api/patient-visits/${visitId}/revisions`); setRevisions(result.data); }
    catch(error) { setError(requestMessage(error,'Unable to load correction history.')); } finally { setLoading(false); }
  }
  return <section className="doctor-panel"><h3>Clinical correction history</h3><button className="doctor-btn-secondary" disabled={loading} onClick={()=>void load()}>{loading ? 'Loading history…' : 'Load correction history'}</button>
    {error && <p className="doctor-error" role="alert">{error}</p>}
    {revisions?.length === 0 && <p>No corrections have been recorded.</p>}
    {revisions?.map(revision=><article className="doctor-record-entry" key={revision.id}><h4>{clinicDateTime(revision.created_at,timezone)}</h4>{Object.entries(revision.revised_record).filter(([key,value])=>key!=='updated_at' && JSON.stringify(value)!==JSON.stringify(revision.previous_record[key])).map(([key,value])=><p key={key}><strong>{key.split('_').join(' ')}:</strong> {String(revision.previous_record[key] ?? 'Not recorded')} → {String(value ?? 'Not recorded')}</p>)}</article>)}
  </section>;
}

export default function DoctorClinicalWorkflow({
  appointmentId,
  existingVisit,
  prescriptions,
  labs,
  onSaved,
  timezone = campusTimezone,
}: {
  appointmentId: string;
  existingVisit?: ClinicalVisit;
  prescriptions: ClinicalPrescription[];
  labs: ClinicalLab[];
  onSaved: () => Promise<void>;
  timezone?: string;
}) {
  const [savedVisit, setSavedVisit] = useState<ClinicalVisit | null>(null);
  const visit = existingVisit ?? savedVisit;
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: Record<string, unknown> = { appointmentId };
    for (const field of ['chiefComplaint', 'history', 'examination', 'assessment', 'plan']) {
      values[field] = String(form.get(field) ?? '').trim() || null;
    }
    for (const vital of vitalFields) {
      const value = form.get(vital.field);
      values[vital.field] = value === '' || value === null ? null : Number(value);
    }
    if (visit) delete values.appointmentId;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest<{ data: ClinicalVisit }>(
        visit ? `/api/patient-visits/${visit.id}` : '/api/patient-visits',
        {
          method: visit ? 'PATCH' : 'POST',
          body: JSON.stringify(values),
        }
      );
      setSavedVisit(result.data);
      setMessage('Clinical documentation saved.');
      await onSaved();
    } catch (error) {
      setError(requestMessage(error, 'Unable to save clinical documentation.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveOrder(
    event: FormEvent<HTMLFormElement>,
    kind: 'prescriptions' | 'lab-orders'
  ) {
    event.preventDefault();
    if (!visit) return;
    const formElement = event.currentTarget;
    const values = Object.fromEntries(new FormData(formElement).entries());
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(`/api/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ ...values, visitId: visit.id }),
      });
      formElement.reset();
      setMessage(kind === 'prescriptions' ? 'Prescription saved.' : 'Laboratory order saved.');
      await onSaved();
    } catch (error) {
      setError(requestMessage(error, 'Unable to save this clinical order.'));
    } finally {
      setBusy(false);
    }
  }

  async function updateOrder(path: string, values: object) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(path, { method: 'PATCH', body: JSON.stringify(values) });
      setMessage('Clinical order updated.');
      await onSaved();
    } catch (error) {
      setError(requestMessage(error, 'Unable to update this clinical order.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="doctor-visit-workflow">
      <h3>{visit ? 'Saved clinical visit' : 'New clinical visit'}</h3>
      {visit && <p>Recorded {clinicDateTime(visit.visit_date, timezone)}</p>}
      <form key={visit?.id ?? appointmentId} onSubmit={saveVisit} className="doctor-form-grid">
        <label className="doctor-full-field">
          Chief complaint
          <textarea
            name="chiefComplaint"
            defaultValue={visit?.chief_complaint ?? ''}
            required
            maxLength={4000}
          />
        </label>
        <label className="doctor-full-field">
          Subjective · History
          <textarea name="history" defaultValue={visit?.history ?? ''} maxLength={10000} />
        </label>
        <label className="doctor-full-field">
          Objective · Examination
          <textarea name="examination" defaultValue={visit?.examination ?? ''} maxLength={10000} />
        </label>
        <label className="doctor-full-field">
          Assessment
          <textarea name="assessment" defaultValue={visit?.assessment ?? ''} maxLength={10000} />
        </label>
        <label className="doctor-full-field">
          Plan
          <textarea name="plan" defaultValue={visit?.plan ?? ''} maxLength={10000} />
        </label>
        {vitalFields.map(vital => (
          <label key={vital.field}>
            {vital.label}
            <input
              name={vital.field}
              type="number"
              step={vital.step}
              min={vital.min}
              max={vital.max}
              defaultValue={visit?.[vital.key] ?? ''}
            />
          </label>
        ))}
        <button className="doctor-btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : visit ? 'Update clinical visit' : 'Save clinical visit'}
        </button>
      </form>
      {visit && <VisitCorrections visitId={visit.id} timezone={timezone} />}
      {visit && (
        <div className="doctor-order-grid">
          <section className="doctor-panel">
            <h3>Prescriptions</h3>
            <form
              className="doctor-form-grid"
              onSubmit={event => void saveOrder(event, 'prescriptions')}
            >
              <label>
                Medication
                <input name="medication" required maxLength={200} />
              </label>
              <label>
                Dosage
                <input name="dosage" required maxLength={200} />
              </label>
              <label>
                Route
                <input name="route" maxLength={80} />
              </label>
              <label>
                Frequency
                <input name="frequency" required maxLength={200} />
              </label>
              <label>
                Duration
                <input name="duration" required maxLength={200} />
              </label>
              <label>
                Quantity
                <input name="quantity" maxLength={100} />
              </label>
              <label className="doctor-full-field">
                Instructions
                <textarea name="instructions" maxLength={4000} />
              </label>
              <button className="doctor-btn-primary" disabled={busy}>
                Save prescription
              </button>
            </form>
            {prescriptions
              .filter(item => item.visit_id === visit.id)
              .map(item => (
                <article className="doctor-record-entry" key={item.id}>
                  <h4>{item.medication}</h4>
                  <p>
                    {item.dosage} · {item.frequency} · {item.duration}
                  </p>
                  {item.route && <p>Route: {item.route}</p>}
                  {item.quantity && <p>Quantity: {item.quantity}</p>}
                  {item.instructions && <p>{item.instructions}</p>}
                  <small>Status: {item.status}</small>
                  {item.status === 'active' && (
                    <div className="doctor-action-row">
                      <button
                        className="doctor-btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          void updateOrder(`/api/prescriptions/${item.id}`, { status: 'completed' })
                        }
                      >
                        Mark completed
                      </button>
                      <button
                        className="doctor-btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          void updateOrder(`/api/prescriptions/${item.id}`, {
                            status: 'discontinued',
                          })
                        }
                      >
                        Discontinue
                      </button>
                    </div>
                  )}
                </article>
              ))}
          </section>
          <section className="doctor-panel">
            <h3>Laboratory orders</h3>
            <form
              className="doctor-form-grid"
              onSubmit={event => void saveOrder(event, 'lab-orders')}
            >
              <label className="doctor-full-field">
                Test name
                <input name="testName" required maxLength={200} />
              </label>
              <label className="doctor-full-field">
                Clinical indication
                <textarea name="clinicalIndication" maxLength={4000} />
              </label>
              <button className="doctor-btn-primary" disabled={busy}>
                Place lab order
              </button>
            </form>
            {labs
              .filter(item => item.visit_id === visit.id)
              .map(item => (
                <LabResultForm
                  key={`${item.id}-${item.status}`}
                  order={item}
                  busy={busy}
                  timezone={timezone}
                  onUpdate={(id, status, resultSummary) =>
                    updateOrder(`/api/lab-orders/${id}`, { status, resultSummary })
                  }
                />
              ))}
          </section>
        </div>
      )}
      {message && (
        <p role="status" className="doctor-success">
          {message}
        </p>
      )}
      {error && (
        <p className="doctor-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
