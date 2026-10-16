import { useId, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Bell, CalendarDays, ClipboardList, FileText, Settings, Stethoscope, UserPlus, Users, Wallet } from 'lucide-react';
import type { AdminOverviewData, OverviewTrend } from '../../lib/admin-overview';
import type { ClinicNotification } from './ClinicOperations';
import { formatClinicDate } from '../../lib/clinic-time';
import './AdminOverview.css';

type Destination = 'appointments' | 'patients' | 'staff' | 'records' | 'reports' | 'schedule' | 'notifications';
type Props = {
  data: AdminOverviewData | null;
  notifications: ClinicNotification[];
  name: string;
  onNavigate: (section: Destination) => void;
  onNewAppointment: () => void;
  onAddPatient: () => void;
  onInvite: (role: 'doctor' | 'receptionist') => void;
};
const count = (value: number) => value.toLocaleString('en-ZA');
const shortTime = (value: string, timezone: string) => new Date(value).toLocaleTimeString('en-ZA', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
const statusText = (value: string) => value.replace(/_/g, ' ');

function Sparkline({ days, label }: { days: OverviewTrend[]; label: string }) {
  const max = Math.max(1, ...days.map(day => day.value));
  const points = days.map((day, i) => `${4 + i * 232 / Math.max(1, days.length - 1)},${35 - day.value / max * 28}`).join(' ');
  return <svg className="ao-sparkline" viewBox="0 0 240 42" role="img" aria-label={`${label}: ${days.length ? days.map(day => `${day.date}: ${day.value}`).join(', ') : 'no new records'}`}>
    <path d="M4 35H236" className="ao-spark-baseline" />
    <polyline points={points || '4,35 236,35'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function AppointmentsChart({ days }: { days: AdminOverviewData['weeklyAppointments'] }) {
  const gradient = useId();
  const [focused, setFocused] = useState<string | null>(null);
  const maximum = Math.max(4, Math.ceil(Math.max(0, ...days.map(day => day.count)) / 4) * 4);
  const points = days.map((day, i) => ({ ...day, x: 42 + i * 420 / Math.max(1, days.length - 1), y: 188 - day.count / maximum * 158 }));
  const line = points.map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  const active = points.find(point => point.date === focused);
  const empty = days.every(day => day.count === 0);
  return <>
    <div className="ao-chart-wrap"><svg viewBox="0 0 490 232" role="img" aria-label={`Appointments Overview, Monday to Sunday. ${empty ? 'No appointments this week. All values zero.' : points.map(point => `${point.day} ${point.date}: ${point.count}`).join('; ')}`}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ff3347" stopOpacity=".3" /><stop offset="1" stopColor="#ff3347" stopOpacity=".015" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1="42" x2="462" y1={188 - tick * 39.5} y2={188 - tick * 39.5} className="ao-chart-grid" /><text x="31" y={193 - tick * 39.5} textAnchor="end">{count(tick * maximum / 4)}</text></g>)}
      {line && <><path d={`${line} L462,188 L42,188 Z`} fill={`url(#${gradient})`} /><path d={line} fill="none" stroke="#ff4052" strokeWidth="2.5" strokeLinejoin="round" /></>}
      {points.map(point => <g key={point.date}><text x={point.x} y="216" textAnchor="middle">{point.day}</text><circle cx={point.x} cy={point.y} r={focused === point.date ? 6 : 4} fill={empty ? '#d9858e' : '#ff4052'} stroke="#20171c" strokeWidth="2" tabIndex={0} role="button" aria-label={`${point.day}, ${point.date}: ${point.count} appointments`} onFocus={() => setFocused(point.date)} onBlur={() => setFocused(null)} onMouseEnter={() => setFocused(point.date)} onMouseLeave={() => setFocused(null)} onClick={() => setFocused(point.date)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setFocused(point.date); } }}><title>{point.date}: {point.count} appointments</title></circle></g>)}
    </svg></div>
    <p className="ao-chart-summary" aria-live="polite">{active ? `${active.day}, ${active.date}: ${count(active.count)} appointments` : empty ? 'No appointments this week.' : 'All appointment statuses · Clinic-local dates'}</p>
    <details className="ao-chart-data"><summary>View daily counts</summary><table><caption>Appointments this week</caption><thead><tr><th>Day</th><th>Date</th><th>Appointments</th></tr></thead><tbody>{days.map(day => <tr key={day.date}><td>{day.day}</td><td>{day.date}</td><td>{day.count}</td></tr>)}</tbody></table></details>
  </>;
}

export default function AdminOverview({ data, notifications, name, onNavigate, onNewAppointment, onAddPatient, onInvite }: Props) {
  if (!data) return <section className="admin-overview"><div className="ao-welcome"><div><h1>Clinic Overview</h1><p>Dashboard data is unavailable. Retry to load the current clinic records.</p></div></div></section>;
  const timezone = data?.timezone || 'Africa/Johannesburg';
  const demographics = data?.demographics || ['Students', 'Employees', 'Faculty', 'Others'].map(category => ({ category, count: 0 }));
  const demographicTotal = demographics.reduce((sum, category) => sum + category.count, 0);
  const colors = ['#ee3043', '#e7a71e', '#23b966', '#4089f4'];
  let offset = 0;
  const cards = [
    { key: 'patients' as const, label: 'Total Patients', icon: Users, color: 'red', note: 'Active patient accounts' },
    { key: 'doctors' as const, label: 'Doctors', icon: Stethoscope, color: 'gold', note: 'Active clinic doctors' },
    { key: 'appointments' as const, label: 'Appointments', icon: CalendarDays, color: 'green', note: 'All recorded appointments' },
    { key: 'medicalRecords' as const, label: 'Medical Records', icon: ClipboardList, color: 'blue', note: 'Recorded clinical visits' },
  ];
  const money = (value: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: data?.finances.currency || 'ZAR', maximumFractionDigits: 2 }).format(value);
  const recent = data?.recentAppointments || [];
  const schedule = data?.todayTimeline || [];
  const notices = [...notifications].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 3);
  return <section className="admin-overview" aria-label="Admin dashboard overview">
    <div className="ao-welcome"><div><h1 aria-label="Clinic Overview">Welcome back, {name}!</h1><p>Here’s what’s happening in your clinic today.</p></div><span className="ao-live-label"><i /> Live data · Refreshes every 15 seconds</span></div>
    <div className="ao-stat-grid">{cards.map(card => { const Icon = card.icon; return <article className={`ao-stat ao-${card.color}`} key={card.key} aria-label={card.label}><div className="ao-stat-top"><span className="ao-icon"><Icon size={27} aria-hidden="true" /></span><div><h2>{card.label}</h2><strong className="ao-stat-value">{data ? count(data.totals[card.key]) : '—'}</strong></div></div><p>{card.note}</p><Sparkline days={data?.trends[card.key] || []} label={`${card.label}, new records over seven days`} /><small>New records · Last 7 days</small></article>; })}</div>
    <div className="ao-middle-grid">
      <article className="ao-panel ao-appointments-chart"><div className="ao-panel-heading"><h2>Appointments Overview</h2><span className="ao-period">This week</span></div><AppointmentsChart days={data?.weeklyAppointments || []} /></article>
      <article className="ao-panel"><div className="ao-panel-heading"><h2>Recent Appointments</h2><button onClick={() => onNavigate('appointments')}>View all<span className="sr-only"> appointments</span></button></div><ul className="ao-recent-list">{recent.map(appointment => <li key={appointment.id}><span className="ao-person-avatar" aria-hidden="true">{initials(appointment.patientName)}</span><div className="ao-person-detail"><strong>{appointment.patientName}</strong><span>{appointment.consultationType}</span><small>{new Date(appointment.startsAt).toLocaleDateString('en-ZA', { timeZone: timezone, month: 'short', day: 'numeric' })} · {shortTime(appointment.startsAt, timezone)}</small></div><span className={`ao-status ao-status-${appointment.status}`}>{statusText(appointment.status)}</span></li>)}</ul>{!recent.length && <div className="ao-empty"><CalendarDays aria-hidden="true" /><p>No appointments recorded yet.</p></div>}</article>
      <article className="ao-panel"><div className="ao-panel-heading"><h2>Today’s Schedule</h2><button onClick={() => onNavigate('appointments')}>View all<span className="sr-only"> scheduled appointments</span></button></div><ol className="ao-timeline">{schedule.map(appointment => <li key={appointment.id}><time dateTime={appointment.startsAt}>{shortTime(appointment.startsAt, timezone)}</time><div><strong>{appointment.consultationType}</strong><span>{appointment.patientName}</span><small>{appointment.doctorName}</small></div></li>)}</ol>{!schedule.length && <div className="ao-empty"><CalendarDays aria-hidden="true" /><p>No appointments scheduled for today.</p></div>}<p className="ao-panel-note">{timezone} · Excludes cancellations and no-shows</p></article>
    </div>
    <div className="ao-bottom-grid">
      <article className="ao-panel"><div className="ao-panel-heading"><h2>Patient Demographics</h2><span className="ao-period">Current</span></div><div className="ao-demographics"><div className="ao-donut"><svg viewBox="0 0 160 160" role="img" aria-label={`Patient demographics: ${demographicTotal} active patients. ${demographics.map(item => `${item.category}: ${item.count}`).join(', ')}`}><circle cx="80" cy="80" r="62" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="24" />{demographics.map((item, i) => { const portion = demographicTotal ? item.count / demographicTotal * 100 : 0; const start = offset; offset += portion; return portion > 0 && <circle key={item.category} cx="80" cy="80" r="62" pathLength="100" fill="none" stroke={colors[i]} strokeWidth="24" strokeDasharray={`${portion} ${100 - portion}`} strokeDashoffset={-start} transform="rotate(-90 80 80)" />; })}</svg><div><strong>{count(demographicTotal)}</strong><span>Total patients</span></div></div><ul className="ao-demographic-legend">{demographics.map((item, i) => <li key={item.category}><span><i style={{ background: colors[i] }} />{item.category}</span><strong>{count(item.count)}<small>{demographicTotal ? (item.count / demographicTotal * 100).toFixed(1).replace(/\.0$/, '') : '0'}%</small></strong></li>)}</ul></div>{!demographicTotal && <p className="ao-panel-note">No active patient accounts yet.</p>}</article>
      <article className="ao-panel"><div className="ao-panel-heading"><h2>Clinic Statistics</h2><span className="ao-period">Financial</span></div><div className="ao-finances">{[{ label: 'Total Revenue', icon: Wallet, color: 'green', value: data?.finances.income }, { label: 'Total Expenses', icon: ArrowDownLeft, color: 'red', value: data?.finances.expenses }, { label: 'Net Revenue', icon: ArrowUpRight, color: 'blue', value: data?.finances.net }].map(item => <div className={`ao-finance ao-${item.color}`} key={item.label}><span className="ao-icon"><item.icon size={22} aria-hidden="true" /></span><div><span>{item.label}</span><strong>{data?.finances.available ? money(item.value || 0) : '—'}</strong></div></div>)}</div>{!data?.finances.available && <p className="ao-panel-note">No financial data recorded. Revenue and expense totals are unavailable.</p>}</article>
      <article className="ao-panel"><div className="ao-panel-heading"><h2>Quick Actions</h2></div><div className="ao-quick-grid"><button className="ao-red" onClick={onNewAppointment}><CalendarDays aria-hidden="true" />New Appointment</button><button className="ao-gold" onClick={onAddPatient}><UserPlus aria-hidden="true" />Add Patient</button><button className="ao-green" onClick={() => onInvite('doctor')}><Stethoscope aria-hidden="true" />Add Doctor</button><button className="ao-blue" onClick={() => onInvite('receptionist')}><UserPlus aria-hidden="true" />Add Receptionist</button><button className="ao-purple" onClick={() => onNavigate('reports')}><FileText aria-hidden="true" />View Reports</button><button className="ao-neutral" onClick={() => onNavigate('schedule')}><Settings aria-hidden="true" />System Settings</button></div></article>
      <article className="ao-panel"><div className="ao-panel-heading"><h2>Notifications</h2><button onClick={() => onNavigate('notifications')}>View all<span className="sr-only"> notifications</span></button></div><ul className="ao-notice-list">{notices.map(notice => <li key={notice.id}><span className="ao-notice-icon"><Bell size={18} aria-hidden="true" /></span><div><strong>{notice.title}</strong><p>{notice.message}</p><time dateTime={notice.created_at}>{formatClinicDate(notice.created_at, timezone)}</time></div>{!notice.read_at && <span className="ao-unread" aria-label="Unread" />}</li>)}</ul>{!notices.length && <div className="ao-empty"><Bell aria-hidden="true" /><p>No notifications yet.</p></div>}</article>
    </div>
    <footer className="ao-footer">SCCPMS · Sol Plaatje University · Smart Campus Clinic Management System</footer>
  </section>;
}
