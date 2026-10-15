import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { apiRequest } from '../../lib/api';
import type { OperationalReport } from '../../lib/analytics';
import { clinicDate } from '../../lib/clinic-time';
import { useLiveRefresh } from '../../lib/useClinicRefresh';
import './AdminReports.css';

type Range = { from: string; to: string };
type Bar = { label: string; count: number; tone?: string };
const actionLabel = (action: string) => action.split(/[._]/).join(' ');

function CountBars({ title, values, empty }: { title: string; values: Bar[]; empty: string }) {
  const maximum = Math.max(1, ...values.map(value => value.count));
  return <section className="admin-report-panel" aria-label={title}><h2>{title}</h2>
    {values.every(value => value.count === 0) ? <p className="clinic-ops-empty">{empty}</p> : <ul className="admin-report-bars">{values.map(value => <li key={value.label}><span>{value.label}</span><div className="admin-report-track" aria-hidden="true"><div className={value.tone ?? ''} style={{ width: `${value.count / maximum * 100}%` }} /></div><strong>{value.count.toLocaleString()}</strong></li>)}</ul>}
  </section>;
}

function DailyPlot({ days }: { days: OperationalReport['daily_activity'] }) {
  const chartId = useId();
  const [focused, setFocused] = useState<number | null>(null);
  const maximum = Math.max(1, ...days.map(day => day.appointments));
  const x = (index: number) => 48 + index / Math.max(1, days.length - 1) * 670;
  const y = (count: number) => 216 - count / maximum * 174;
  const path = (field: 'appointments' | 'completed') => days.map((day, index) => `${index ? 'L' : 'M'}${x(index)},${y(day[field])}`).join(' ');
  const selected = focused !== null ? days[focused] : null;
  const hasActivity = days.some(day => day.appointments > 0);
  return <section className="admin-report-panel admin-report-full" aria-label="Daily appointment trend"><h2>Daily appointment trend</h2><p className="clinic-ops-muted">All recorded bookings, including cancelled appointments. Completed appointments are shown separately.</p>
    {!hasActivity ? <p className="clinic-ops-empty">No appointments recorded in this date range.</p> : <>
      <div className="admin-report-legend"><span><i />Appointments</span><span><i className="complete" />Completed</span></div>
      <div className="admin-report-plot-scroll" role="region" aria-label="Scrollable daily appointment plot" tabIndex={0}><svg className="admin-report-plot" viewBox="0 0 760 265" role="img" aria-labelledby={`${chartId}-title ${chartId}-description`}>
        <title id={`${chartId}-title`}>Daily appointment and completion counts</title><desc id={`${chartId}-description`}>Counts from {days[0].date} to {days[days.length - 1].date}. The table below contains every date and exact total.</desc>
        {[0, .5, 1].map(fraction => <g key={fraction}><line x1="48" x2="718" y1={y(maximum * fraction)} y2={y(maximum * fraction)} className="admin-report-gridline" /><text x="38" y={y(maximum * fraction) + 4} textAnchor="end">{Number((maximum * fraction).toFixed(1))}</text></g>)}
        <path d={path('appointments')} className="admin-report-line" /><path d={path('completed')} className="admin-report-line complete" />
        {days.map((day, index) => <circle key={day.date} cx={x(index)} cy={y(day.appointments)} r="4" className="admin-report-point" tabIndex={0} aria-label={`${day.date}: ${day.appointments} appointments, ${day.completed} completed`} onFocus={() => setFocused(index)} onMouseEnter={() => setFocused(index)}><title>{day.date}: {day.appointments} appointments; {day.completed} completed</title></circle>)}
        <text x="48" y="249">{days[0].date}</text><text x="718" y="249" textAnchor="end">{days[days.length - 1].date}</text>
      </svg></div>
      <p className="admin-report-point-summary">{selected ? `${selected.date}: ${selected.appointments} appointments · ${selected.completed} completed · ${selected.cancelled} cancelled · ${selected.no_show} no-shows · ${selected.walk_ins} walk-ins` : 'Focus or hover on a point to inspect its recorded counts.'}</p>
    </>}
    <details className="admin-report-details"><summary>View daily counts</summary><div className="clinic-ops-table"><table><thead><tr><th>Date</th><th>Appointments</th><th>Completed</th><th>Cancelled</th><th>No-shows</th><th>Walk-ins</th></tr></thead><tbody>{days.map(day => <tr key={day.date}><td>{day.date}</td><td>{day.appointments}</td><td>{day.completed}</td><td>{day.cancelled}</td><td>{day.no_show}</td><td>{day.walk_ins}</td></tr>)}{!days.length && <tr><td colSpan={6} className="clinic-ops-empty">No dates returned for this report.</td></tr>}</tbody></table></div></details>
  </section>;
}

export default function OperationalReports({ timezone }: { timezone: string }) {
  const [draft, setDraft] = useState<Range>(() => ({ from: clinicDate(new Date(Date.now() - 29 * 86400000), timezone), to: clinicDate(new Date(), timezone) }));
  const [applied, setApplied] = useState(draft);
  const [report, setReport] = useState<OperationalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async (range: Range = applied) => {
    const current = ++request.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError('');
    try {
      const result = await apiRequest<{ data: OperationalReport }>(`/api/reports/summary?${new URLSearchParams(range)}`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]) });
      if (current !== request.current || abort.signal.aborted) return;
      const data = result.data;
      if (!data || data.from !== range.from || data.to !== range.to || !Array.isArray(data.daily_activity) || !Array.isArray(data.doctor_activity) || !Array.isArray(data.account_activity) || !data.account_counts) throw new Error('The report could not be loaded. Please try again.');
      setReport(data);
    } catch (failure) {
      if (current === request.current && !abort.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to load the report.');
    } finally { if (current === request.current && !abort.signal.aborted) setLoading(false); }
  }, [applied]);
  useLiveRefresh(load);
  useEffect(() => () => { request.current += 1; controller.current?.abort(); }, []);
  function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const duration = (Date.parse(`${draft.to}T00:00:00Z`) - Date.parse(`${draft.from}T00:00:00Z`)) / 86400000;
    if (!Number.isFinite(duration) || duration < 0 || duration > 365) { setError('Select a date range of up to 366 days.'); return; }
    setApplied({ ...draft }); void load(draft);
  }
  const visible = report?.from === applied.from && report?.to === applied.to ? report : null;
  const outcomes: Bar[] = visible ? [
    { label: 'Pending', count: visible.pending }, { label: 'Confirmed', count: visible.confirmed }, { label: 'In progress', count: visible.in_progress },
    { label: 'Completed', count: visible.completed, tone: 'complete' }, { label: 'Cancelled', count: visible.cancelled, tone: 'cancelled' }, { label: 'No-show', count: visible.no_show, tone: 'no-show' },
  ] : [];
  return <section className="clinic-ops">
    <div className="clinic-ops-heading"><div><h1>Operational Reports</h1><p>Clinic activity for the selected dates, using recorded data. Timezone: {timezone}.</p></div></div>
    <form className="clinic-ops-form" onSubmit={run}><label>From<input required type="date" max={draft.to} value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label><label>To<input required type="date" min={draft.from} value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label><div className="clinic-ops-actions clinic-ops-wide"><button className="primary" disabled={loading}>Run report</button><span className="clinic-ops-muted">Up to 366 days. Changing a date does not apply it until you run the report.</span></div></form>
    {error && <p className="clinic-ops-error" role="alert">{error}</p>}
    {loading && <p className="clinic-ops-muted" role="status">{visible ? 'Updating report…' : 'Loading report…'}</p>}
    {visible && <>
      <p className="clinic-ops-muted">Showing {visible.from} to {visible.to}, inclusive ({visible.timezone}).</p>
      <div className="admin-stats-grid admin-report-stats" aria-label="Selected date activity">{[
        ['Appointments', visible.appointments], ['Completed appointments', visible.completed], ['Completion rate', `${visible.appointments ? Math.round(visible.completed / visible.appointments * 1000) / 10 : 0}%`], ['Patients seen', visible.patients_seen], ['Walk-ins', visible.walk_ins], ['Clinical visits', visible.clinical_visits], ['Prescriptions', visible.prescriptions], ['Laboratory orders', visible.lab_orders],
      ].map(([label, count]) => <div className="admin-stat-card" key={label}><span>{label}</span><strong>{typeof count === 'number' ? count.toLocaleString() : count}</strong></div>)}</div>
      <div className="admin-report-grid"><DailyPlot key={`${visible.from}-${visible.to}`} days={visible.daily_activity} /><CountBars title="Appointment outcomes" values={outcomes} empty="No appointment outcomes in this date range." />
        <CountBars title="Account activity in selected dates" values={visible.account_activity.map(item => ({ label: actionLabel(item.action), count: item.count }))} empty="No account activity recorded in this date range." />
        <section className="admin-report-panel admin-report-full"><h2>Doctor workload</h2><p className="clinic-ops-muted">Appointments scheduled in the selected dates. Retained history includes doctors whose login accounts were deleted.</p><div className="clinic-ops-table"><table><thead><tr><th>Doctor</th><th>Appointments</th><th>Completed</th><th>Cancelled</th><th>No-shows</th></tr></thead><tbody>{visible.doctor_activity.map(doctor => <tr key={doctor.doctor_id}><td>{doctor.doctor_name}</td><td>{doctor.appointments}</td><td>{doctor.completed}</td><td>{doctor.cancelled}</td><td>{doctor.no_show}</td></tr>)}{!visible.doctor_activity.length && <tr><td colSpan={5} className="clinic-ops-empty">No doctor appointment activity in this date range.</td></tr>}</tbody></table></div></section>
        <CountBars title="Current active accounts" values={[
          { label: 'Administrators', count: visible.account_counts.admin }, { label: 'Doctors', count: visible.account_counts.doctor }, { label: 'Receptionists', count: visible.account_counts.receptionist }, { label: 'Patients', count: visible.account_counts.patient },
        ]} empty="No active accounts." />
        <section className="admin-report-panel"><h2>Current account and clinic status</h2><p className="clinic-ops-muted">Current totals, independent of the report dates.</p><dl className="admin-report-totals"><div><dt>Inactive accounts</dt><dd>{visible.account_counts.inactive}</dd></div><div><dt>Deleted login accounts</dt><dd>{visible.account_counts.deleted}</dd></div><div><dt>Doctors available for booking</dt><dd>{visible.active_doctors}</dd></div><div><dt>Pending leave requests</dt><dd>{visible.pending_leave}</dd></div></dl></section>
      </div>
    </>}
  </section>;
}
