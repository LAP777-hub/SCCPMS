import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  Bell,
  Calendar,
  CalendarCheck,
  Check,
  ChevronRight,
  FileText,
  Home,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { apiRequest } from '../lib/api';
import type { Profile } from '../lib/supabase';
import {
  campusTimezone,
  clinicDate,
  clinicTime,
  requestMessage,
  type ClinicSettings,
} from '../lib/dashboardTime';
import { useDoctorAvailability } from '../lib/useDoctorAvailability';
import SidebarBrand from './SidebarBrand';
import './ClinicalDashboards.css';

const PatientTimezoneContext = createContext(campusTimezone);

type PatientSection =
  'dashboard' | 'book' | 'appointments' | 'doctors' | 'records' | 'profile' | 'notifications';
type AppointmentStatus =
  'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
type Appointment = {
  id: string;
  doctor_id: string;
  doctor_name: string;
  specialty: string;
  consultation_type: string;
  starts_at: string;
  ends_at: string;
  mode: 'in_person' | 'telehealth';
  reason: string | null;
  status: AppointmentStatus;
};
type Doctor = {
  id: string;
  user_id: string;
  full_name: string;
  specialty: string;
  department: string | null;
};
type Notification = {
  id: string;
  title: string;
  message: string;
  category: string;
  read_at: string | null;
  created_at: string;
};
type Visit = {
  id: string;
  visit_date: string;
  chief_complaint: string;
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
type Prescription = {
  id: string;
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
type LabOrder = {
  id: string;
  test_name: string;
  status: string;
  result_summary: string | null;
  resulted_at: string | null;
  created_at: string;
};
type DashboardData = {
  appointments: Appointment[];
  doctors: Doctor[];
  notifications: Notification[];
  visits: Visit[];
  prescriptions: Prescription[];
  labs: LabOrder[];
};

const navItems: { id: PatientSection; label: string; icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'book', label: 'Book Appointment', icon: CalendarCheck },
  { id: 'appointments', label: 'My Appointments', icon: Calendar },
  { id: 'doctors', label: 'Available Doctors', icon: Users },
  { id: 'records', label: 'Health Records', icon: FileText },
  { id: 'profile', label: 'My Profile', icon: UserRound },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

function formatDate(value: string, timezone = campusTimezone) {
  return new Date(value).toLocaleDateString('en-ZA', {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(value: string, timezone = campusTimezone) {
  return clinicTime(value, timezone);
}

function formatStatus(status: AppointmentStatus) {
  return status
    .split('_')
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

function Avatar({ name }: { name: string }) {
  return <span className="patient-avatar">{initials(name)}</span>;
}

function StatusPill({ status }: { status: AppointmentStatus }) {
  return <span className={`patient-status ${status}`}>{formatStatus(status)}</span>;
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="patient-section-title">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function Stat({
  icon: Icon,
  title,
  value,
  detail,
  tone,
}: {
  icon: typeof Calendar;
  title: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className={`patient-stat ${tone}`}>
      <span>
        <Icon size={23} />
      </span>
      <div>
        <small>{title}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </div>
      <ChevronRight size={18} />
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`patient-card ${className}`}>{children}</div>;
}

function CardHeader({ icon: Icon, title }: { icon: typeof Calendar; title: string }) {
  return (
    <div className="patient-card-header">
      <h2>
        <Icon size={17} />
        {title}
      </h2>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="patient-empty-state">{children}</div>;
}

function RescheduleControl({
  appointment,
  doctors,
  onUpdated,
}: {
  appointment: Appointment;
  doctors: Doctor[];
  onUpdated: () => void;
}) {
  const timezone = useContext(PatientTimezoneContext);
  const [open, setOpen] = useState(false);
  const [doctorId, setDoctorId] = useState(appointment.doctor_id);
  const [date, setDate] = useState(() => clinicDate(appointment.starts_at, timezone));
  const [slotId, setSlotId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const {
    slots,
    loading: loadingSlots,
    error: availabilityError,
    refresh: refreshSlots,
  } = useDoctorAvailability(doctorId, date, open);

  useEffect(() => {
    if (slotId && !slots.some(slot => slot.id === slotId)) setSlotId('');
  }, [slots, slotId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slots.some(slot => slot.id === slotId)) {
      setError('Choose an available appointment time.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/appointments/${appointment.id}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({ slotId }),
      });
      setOpen(false);
      onUpdated();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to reschedule appointment.'
      );
      await refreshSlots();
    } finally {
      setSaving(false);
    }
  }

  if (!['pending', 'confirmed'].includes(appointment.status)) return null;
  return (
    <>
      <button className="patient-secondary" onClick={() => setOpen(value => !value)}>
        {open ? 'Close' : 'Reschedule'}
      </button>
      {open && (
        <form className="patient-reschedule-form" onSubmit={submit}>
          <label>
            Doctor
            <select
              value={doctorId}
              onChange={event => {
                setDoctorId(event.target.value);
                setSlotId('');
              }}
            >
              {doctors.map(doctor => (
                <option value={doctor.id} key={doctor.id}>
                  {doctor.full_name} · {doctor.specialty}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input
              type="date"
              min={clinicDate(new Date(), timezone)}
              value={date}
              onChange={event => {
                setDate(event.target.value);
                setSlotId('');
              }}
              required
            />
          </label>
          <label>
            Available time ({timezone})
            <select
              value={slotId}
              onChange={event => setSlotId(event.target.value)}
              required
              disabled={loadingSlots || !slots.length}
            >
              <option value="">
                {loadingSlots
                  ? 'Loading available times…'
                  : slots.length
                    ? 'Select a time'
                    : 'No times available'}
              </option>
              {slots.map(slot => (
                <option key={slot.id} value={slot.id}>
                  {formatTime(slot.starts_at, timezone)}–{formatTime(slot.ends_at, timezone)}
                </option>
              ))}
            </select>
          </label>
          {availabilityError && (
            <p className="patient-error" role="alert">
              {availabilityError}
            </p>
          )}
          {error && (
            <p className="patient-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="patient-primary"
            type="submit"
            disabled={saving || loadingSlots || !slotId}
          >
            {saving ? 'Saving…' : 'Confirm reschedule'}
          </button>
        </form>
      )}
    </>
  );
}

function AppointmentTable({
  rows,
  onCancel,
  doctors,
  onUpdated,
}: {
  rows: Appointment[];
  onCancel: (id: string) => void;
  doctors: Doctor[];
  onUpdated: () => void;
}) {
  const timezone = useContext(PatientTimezoneContext);
  const [cancelling, setCancelling] = useState('');
  if (!rows.length) return <EmptyState>No appointments have been booked yet.</EmptyState>;
  return (
    <div className="patient-table-wrap">
      <table className="patient-table">
        <thead>
          <tr>
            <th>Doctor</th>
            <th>Consultation</th>
            <th>Date</th>
            <th>Time</th>
            <th>Mode</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(appointment => (
            <tr key={appointment.id}>
              <td>
                <div className="patient-person">
                  <Avatar name={appointment.doctor_name} />
                  <span>
                    <strong>{appointment.doctor_name}</strong>
                    <small>{appointment.specialty}</small>
                  </span>
                </div>
              </td>
              <td>
                {appointment.consultation_type}
                {appointment.reason && (
                  <small className="doctor-detail-text">{appointment.reason}</small>
                )}
              </td>
              <td>{formatDate(appointment.starts_at, timezone)}</td>
              <td>
                {formatTime(appointment.starts_at, timezone)}–
                {formatTime(appointment.ends_at, timezone)}
              </td>
              <td>{appointment.mode === 'in_person' ? 'In person' : 'Telehealth'}</td>
              <td>
                <StatusPill status={appointment.status} />
              </td>
              <td>
                {['pending', 'confirmed'].includes(appointment.status) && (
                  <>
                    <button
                      className="patient-secondary"
                      disabled={!!cancelling}
                      onClick={async () => {
                        setCancelling(appointment.id);
                        try {
                          await onCancel(appointment.id);
                        } finally {
                          setCancelling('');
                        }
                      }}
                    >
                      {cancelling === appointment.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                    <RescheduleControl
                      appointment={appointment}
                      doctors={doctors}
                      onUpdated={onUpdated}
                    />
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PatientOverview({
  profile,
  appointments,
  doctors,
  notifications,
  onNavigate,
  onCancel,
  onUpdated,
}: {
  profile: Profile | null;
  appointments: Appointment[];
  doctors: Doctor[];
  notifications: Notification[];
  onNavigate: (section: PatientSection) => void;
  onCancel: (id: string) => void;
  onUpdated: () => void;
}) {
  const timezone = useContext(PatientTimezoneContext);
  const upcoming = appointments
    .filter(
      item =>
        ['pending', 'confirmed'].includes(item.status) &&
        new Date(item.ends_at).getTime() > Date.now()
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const unread = notifications.filter(item => !item.read_at).length;
  const name = profile?.full_name || profile?.email || 'Patient';
  return (
    <div className="patient-content">
      <SectionTitle
        title={`Welcome, ${name}`}
        description="Your appointments and clinic information."
      />
      <div className="patient-stats-grid">
        <Stat
          icon={CalendarCheck}
          title="Upcoming Appointments"
          value={String(upcoming.length)}
          detail="Pending or confirmed"
          tone="red"
        />
        <Stat
          icon={Check}
          title="Completed Appointments"
          value={String(appointments.filter(item => item.status === 'completed').length)}
          detail="Recorded in your account"
          tone="gold"
        />
        <Stat
          icon={Stethoscope}
          title="Available Doctors"
          value={String(doctors.length)}
          detail="Active clinic directory"
          tone="blue"
        />
        <Stat
          icon={Bell}
          title="Unread Notifications"
          value={String(unread)}
          detail="Account updates"
          tone="green"
        />
      </div>
      <div className="patient-dashboard-grid">
        <Card className="patient-appointment-card">
          <CardHeader icon={CalendarCheck} title="My Upcoming Appointments" />
          <AppointmentTable
            rows={upcoming.slice(0, 5)}
            onCancel={onCancel}
            doctors={doctors}
            onUpdated={onUpdated}
          />
        </Card>
        <div className="patient-side-stack">
          <Card>
            <CardHeader icon={Stethoscope} title="Available Doctors" />
            {doctors.slice(0, 5).map(doctor => (
              <div className="patient-doctor-row" key={doctor.id}>
                <Avatar name={doctor.full_name} />
                <div>
                  <strong>{doctor.full_name}</strong>
                  <small>{doctor.specialty}</small>
                </div>
              </div>
            ))}
            {!doctors.length && (
              <EmptyState>No doctors have been added to the clinic directory.</EmptyState>
            )}
            {doctors.length > 0 && (
              <button className="patient-secondary" onClick={() => onNavigate('doctors')}>
                View directory <ChevronRight size={15} />
              </button>
            )}
          </Card>
          <Card>
            <CardHeader icon={Bell} title="Recent Notifications" />
            {notifications.slice(0, 3).map(item => (
              <div className="patient-mini-notice" key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.message}</small>
                </span>
                <em>{formatDate(item.created_at, timezone)}</em>
              </div>
            ))}
            {!notifications.length && <EmptyState>No notifications yet.</EmptyState>}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Booking({
  doctors,
  initialDoctorId,
  settings,
  onBooked,
}: {
  doctors: Doctor[];
  initialDoctorId: string;
  settings: ClinicSettings | null;
  onBooked: () => Promise<void>;
}) {
  const timezone = useContext(PatientTimezoneContext);
  const [doctorId, setDoctorId] = useState(initialDoctorId);
  const [consultationType, setConsultationType] = useState('General Consultation');
  const [date, setDate] = useState(() => clinicDate(new Date(), timezone));
  const [slotId, setSlotId] = useState('');
  const [mode, setMode] = useState<'in_person' | 'telehealth'>('in_person');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedDoctorId = doctors.some(doctor => doctor.id === doctorId)
    ? doctorId
    : doctors[0]?.id || '';
  const {
    slots,
    loading: loadingSlots,
    error: availabilityError,
    refresh: refreshSlots,
  } = useDoctorAvailability(selectedDoctorId, date);

  useEffect(() => {
    if (slotId && !slots.some(slot => slot.id === slotId)) setSlotId('');
  }, [slots, slotId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slots.some(slot => slot.id === slotId)) {
      setError('Choose an available appointment time.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await apiRequest('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({ slotId, consultationType, mode, reason }),
      });
      await onBooked();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to book this appointment.'
      );
      await refreshSlots();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="patient-content">
      <SectionTitle
        title="Book Appointment"
        description={`Choose an available clinic appointment. Times use ${timezone}.`}
      />
      {!doctors.length ? (
        <Card>
          <EmptyState>
            Appointments are unavailable until the clinic adds doctors to the directory.
          </EmptyState>
        </Card>
      ) : (
        <Card className="patient-booking-form">
          <form onSubmit={submit}>
            <label className="patient-field">
              Doctor
              <select
                className="patient-input"
                value={selectedDoctorId}
                onChange={event => {
                  setDoctorId(event.target.value);
                  setSlotId('');
                }}
                required
              >
                {doctors.map(doctor => (
                  <option value={doctor.id} key={doctor.id}>
                    {doctor.full_name} · {doctor.specialty}
                  </option>
                ))}
              </select>
            </label>
            <label className="patient-field">
              Consultation type
              <input
                className="patient-input"
                value={consultationType}
                onChange={event => setConsultationType(event.target.value)}
                required
                minLength={2}
                maxLength={120}
              />
            </label>
            <label className="patient-field">
              Date
              <input
                className="patient-input"
                type="date"
                min={clinicDate(new Date(), timezone)}
                value={date}
                onChange={event => {
                  setDate(event.target.value);
                  setSlotId('');
                }}
                required
              />
            </label>
            <label className="patient-field">
              Available appointment time
              <select
                className="patient-input"
                value={slotId}
                onChange={event => setSlotId(event.target.value)}
                required
                disabled={loadingSlots || !slots.length}
              >
                <option value="">
                  {loadingSlots
                    ? 'Loading availability…'
                    : slots.length
                      ? 'Choose an available time'
                      : 'No available times for this date'}
                </option>
                {slots.map(slot => (
                  <option value={slot.id} key={slot.id}>
                    {formatTime(slot.starts_at, timezone)} – {formatTime(slot.ends_at, timezone)}
                  </option>
                ))}
              </select>
            </label>
            <label className="patient-field">
              Appointment mode
              <select
                className="patient-input"
                value={mode}
                onChange={event => setMode(event.target.value as typeof mode)}
              >
                <option value="in_person">In person</option>
                <option value="telehealth">Telehealth</option>
              </select>
            </label>
            <label className="patient-field">
              Reason for visit
              <textarea
                className="patient-textarea"
                value={reason}
                onChange={event => setReason(event.target.value)}
                maxLength={2000}
              />
            </label>
            {settings && (
              <p className="patient-profile-note">
                Clinic hours: {settings.opens_at.slice(0, 5)}–{settings.closes_at.slice(0, 5)}.
                Rescheduling requires {settings.minimum_reschedule_notice_hours} hours notice.
                Availability updates automatically.
              </p>
            )}
            {availabilityError && (
              <p className="patient-error" role="alert">
                {availabilityError}
              </p>
            )}
            {error && (
              <p className="patient-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="patient-primary"
              type="submit"
              disabled={saving || loadingSlots || !slotId}
            >
              {saving ? 'Submitting…' : 'Request appointment'}
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}

function DoctorsView({
  doctors,
  onBook,
  initialQuery = '',
}: {
  doctors: Doctor[];
  onBook: (id: string) => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const filtered = doctors.filter(doctor =>
    `${doctor.full_name} ${doctor.specialty} ${doctor.department ?? ''}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  return (
    <div className="patient-content">
      <SectionTitle
        title="Available Doctors"
        description="Clinic directory of active practitioners."
      />
      <Card className="patient-doctors-card">
        <div className="patient-search">
          <Search size={16} />
          <input
            aria-label="Search doctors"
            placeholder="Search by name, specialty, or department"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        {!filtered.length ? (
          <EmptyState>
            {query
              ? 'No doctors match your search.'
              : 'No doctors have been added to the clinic directory.'}
          </EmptyState>
        ) : (
          <div className="patient-doctor-directory">
            {filtered.map(doctor => (
              <div className="patient-directory-row" key={doctor.id}>
                <Avatar name={doctor.full_name} />
                <div className="doctor-directory-name">
                  <strong>{doctor.full_name}</strong>
                  <small>{doctor.specialty}</small>
                </div>
                <p>{doctor.department || 'Department not recorded'}</p>
                <button className="patient-primary" onClick={() => onBook(doctor.id)}>
                  Book appointment
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AppointmentsView({
  appointments,
  onCancel,
  doctors,
  onUpdated,
}: {
  appointments: Appointment[];
  onCancel: (id: string) => void;
  doctors: Doctor[];
  onUpdated: () => void;
}) {
  const [filter, setFilter] = useState('all');
  const visible =
    filter === 'all' ? appointments : appointments.filter(item => item.status === filter);
  return (
    <div className="patient-content">
      <SectionTitle title="My Appointments" description="Appointments recorded for your account." />
      <Card className="patient-appointment-card">
        <div className="patient-filters">
          <select
            aria-label="Filter appointments"
            value={filter}
            onChange={event => setFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No show</option>
          </select>
        </div>
        <AppointmentTable
          rows={visible}
          onCancel={onCancel}
          doctors={doctors}
          onUpdated={onUpdated}
        />
      </Card>
    </div>
  );
}

function ProfileView({ profile }: { profile: Profile | null }) {
  const { refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(
      Array.from(new FormData(event.currentTarget).entries()).map(([name, value]) => [
        name,
        String(value).trim() || null,
      ])
    );
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest('/api/profile', { method: 'PATCH', body: JSON.stringify(values) });
      await refreshProfile();
      setMessage('Profile saved.');
    } catch (error) {
      setError(requestMessage(error, 'Unable to save your profile.'));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="patient-content">
      <SectionTitle
        title="My Profile"
        description="Account and university information currently on file."
      />
      <Card className="patient-profile-header">
        <div className="patient-large-profile">
          <Avatar name={profile?.full_name || profile?.email || 'Patient'} />
          <span>
            <h2>{profile?.full_name || 'Name not provided'}</h2>
            <b>Patient</b>
            <p>{profile?.email}</p>
          </span>
        </div>
        <div className="patient-identity">
          <strong>
            <ShieldCheck size={16} /> University identity
          </strong>
          <small>Account type</small>
          <span>{profile?.user_type || 'Not provided'}</span>
          <small>Student number</small>
          <span>{profile?.student_number || 'Not provided'}</span>
          <small>Staff number</small>
          <span>{profile?.staff_number || 'Not provided'}</span>
          <small>Department</small>
          <span>{profile?.department || 'Not provided'}</span>
          <small>Program</small>
          <span>{profile?.program || 'Not provided'}</span>
          <small>Phone</small>
          <span>{profile?.phone || 'Not provided'}</span>
        </div>
      </Card>
      <Card>
        <CardHeader icon={UserRound} title="Personal details" />
        <form className="patient-profile-form" onSubmit={saveProfile}>
          <label className="patient-field">
            Full name
            <input
              className="patient-input"
              name="full_name"
              defaultValue={profile?.full_name ?? ''}
              required
              minLength={2}
              maxLength={160}
            />
          </label>
          <label className="patient-field">
            Address line 1
            <input
              className="patient-input"
              name="address_line1"
              defaultValue={profile?.address_line1 ?? ''}
              maxLength={200}
            />
          </label>
          <label className="patient-field">
            Address line 2
            <input
              className="patient-input"
              name="address_line2"
              defaultValue={profile?.address_line2 ?? ''}
              maxLength={200}
            />
          </label>
          <label className="patient-field">
            City
            <input
              className="patient-input"
              name="city"
              defaultValue={profile?.city ?? ''}
              maxLength={120}
            />
          </label>
          <label className="patient-field">
            Province
            <input
              className="patient-input"
              name="province"
              defaultValue={profile?.province ?? ''}
              maxLength={120}
            />
          </label>
          <label className="patient-field">
            Postal code
            <input
              className="patient-input"
              name="postal_code"
              defaultValue={profile?.postal_code ?? ''}
              maxLength={20}
            />
          </label>
          <p className="patient-profile-note">
            Contact the clinic to correct your university identity or change your account email for verification codes.
            The details shown above are the identity information on file.
          </p>
          {error && (
            <p className="patient-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="patient-success" role="status">
              {message}
            </p>
          )}
          <button className="patient-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </Card>
    </div>
  );
}

function NotificationsView({
  notifications,
  onRead,
  onReadAll,
}: {
  notifications: Notification[];
  onRead: (id: string) => void;
  onReadAll: () => void;
}) {
  const timezone = useContext(PatientTimezoneContext);
  const [busy, setBusy] = useState('');
  return (
    <div className="patient-content">
      <SectionTitle title="Notifications" description="Updates generated by clinic activity." />
      <Card>
        <div className="patient-card-header">
          <h2>
            <Bell size={17} />
            Notifications
          </h2>
          <button
            className="patient-mark-read"
            disabled={!!busy || !notifications.some(item => !item.read_at)}
            onClick={async () => {
              setBusy('all');
              try {
                await onReadAll();
              } finally {
                setBusy('');
              }
            }}
          >
            Mark all as read
          </button>
        </div>
        {!notifications.length ? (
          <EmptyState>No notifications yet.</EmptyState>
        ) : (
          <div className="patient-notification-list">
            {notifications.map(item => (
              <button
                className={`patient-notification-row ${item.read_at ? '' : 'unread'}`}
                key={item.id}
                disabled={!!busy || !!item.read_at}
                onClick={async () => {
                  setBusy(item.id);
                  try {
                    await onRead(item.id);
                  } finally {
                    setBusy('');
                  }
                }}
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.message}</small>
                </span>
                <time>
                  {formatDate(item.created_at, timezone)} {formatTime(item.created_at, timezone)}
                </time>
                <em>{item.category}</em>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function HealthRecordsView({
  visits,
  prescriptions,
  labs,
  onRefresh,
}: {
  visits: Visit[];
  prescriptions: Prescription[];
  labs: LabOrder[];
  onRefresh: () => void;
}) {
  const timezone = useContext(PatientTimezoneContext);
  const vitals = (visit: Visit) =>
    [
      visit.temperature_c != null ? `${visit.temperature_c} °C` : '',
      visit.blood_pressure_systolic != null
        ? `BP ${visit.blood_pressure_systolic}/${visit.blood_pressure_diastolic ?? '—'} mmHg`
        : '',
      visit.heart_rate != null ? `HR ${visit.heart_rate} bpm` : '',
      visit.respiratory_rate != null ? `Respiratory rate ${visit.respiratory_rate}/min` : '',
      visit.oxygen_saturation != null ? `SpO₂ ${visit.oxygen_saturation}%` : '',
      visit.weight_kg != null ? `${visit.weight_kg} kg` : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'Not recorded';
  return (
    <div className="patient-content">
      <SectionTitle
        title="Health Records"
        description="Clinical records and orders associated with your account."
      />
      <div className="patient-profile-actions">
        <button className="patient-secondary" onClick={onRefresh}>
          <RefreshCw size={15} />
          Refresh health records
        </button>
      </div>
      <div className="patient-dashboard-grid">
        <Card>
          <CardHeader icon={FileText} title="Visit History" />
          {visits.length ? (
            visits.map(visit => (
              <article className="patient-record-entry" key={visit.id}>
                <h3>{formatDate(visit.visit_date, timezone)}</h3>
                <p>
                  <strong>Reason for visit:</strong> {visit.chief_complaint}
                </p>
                {visit.assessment && (
                  <p>
                    <strong>Assessment:</strong> {visit.assessment}
                  </p>
                )}
                {visit.plan && (
                  <p>
                    <strong>Plan:</strong> {visit.plan}
                  </p>
                )}
                <small>Vitals: {vitals(visit)}</small>
              </article>
            ))
          ) : (
            <EmptyState>No visit records have been added.</EmptyState>
          )}
        </Card>
        <div className="patient-side-stack">
          <Card>
            <CardHeader icon={FileText} title="Prescriptions" />
            {prescriptions.length ? (
              prescriptions.map(item => (
                <article className="patient-record-entry" key={item.id}>
                  <h3>{item.medication}</h3>
                  <p>
                    {item.dosage} · {item.frequency} · {item.duration}
                  </p>
                  <small>
                    Status: {item.status} · {formatDate(item.created_at, timezone)}
                  </small>
                  {item.route && <p>Route: {item.route}</p>}
                  {item.quantity && <p>Quantity: {item.quantity}</p>}
                  {item.instructions && <p>{item.instructions}</p>}
                </article>
              ))
            ) : (
              <EmptyState>No prescriptions recorded.</EmptyState>
            )}
          </Card>
          <Card>
            <CardHeader icon={FileText} title="Laboratory Orders" />
            {labs.length ? (
              labs.map(item => (
                <article className="patient-record-entry" key={item.id}>
                  <h3>{item.test_name}</h3>
                  <p>Status: {item.status}</p>
                  <small>Ordered {formatDate(item.created_at, timezone)}</small>
                  {item.result_summary && <p>{item.result_summary}</p>}
                  {item.resulted_at && (
                    <small>Result recorded {formatDate(item.resulted_at, timezone)}</small>
                  )}
                </article>
              ))
            ) : (
              <EmptyState>No laboratory orders recorded.</EmptyState>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function PatientDashboard() {
  const { profile, signOut } = useAuth();
  const [activeSection, setActiveSection] = useState<PatientSection>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<DashboardData>({
    appointments: [],
    doctors: [],
    notifications: [],
    visits: [],
    prescriptions: [],
    labs: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [recordsError, setRecordsError] = useState('');
  const [message, setMessage] = useState('');
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [search, setSearch] = useState('');
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const active = useRef(false);
  const sectionRef = useRef(activeSection);
  sectionRef.current = activeSection;
  const refreshing = useRef<Promise<void> | null>(null);
  const timezone = settings?.timezone ?? campusTimezone;

  const refresh = useCallback(async (includeRecords = false): Promise<void> => {
    while (refreshing.current) {
      await refreshing.current;
      if (!active.current) return;
    }
    const run = async () => {
      const errors: string[] = [];
      const clinicalErrors: string[] = [];
      const requests: Promise<void>[] = [];
      const load = <T,>(path: string, apply: (value: T) => void, clinical = false) => {
        requests.push(
          apiRequest<{ data: T }>(path)
            .then(({ data }) => {
              if (active.current) apply(data);
            })
            .catch((error: unknown) => {
              (clinical ? clinicalErrors : errors).push(
                requestMessage(error, 'Unable to load clinic records.')
              );
            })
        );
      };
      load<Appointment[]>('/api/appointments', appointments =>
        setData(current => ({ ...current, appointments }))
      );
      load<Doctor[]>('/api/doctors', doctors => setData(current => ({ ...current, doctors })));
      load<Notification[]>('/api/notifications', notifications =>
        setData(current => ({ ...current, notifications }))
      );
      load<ClinicSettings>('/api/clinic/settings', setSettings);
      if (includeRecords) {
        load<Visit[]>(
          '/api/patient-visits',
          visits => setData(current => ({ ...current, visits })),
          true
        );
        load<Prescription[]>(
          '/api/prescriptions',
          prescriptions => setData(current => ({ ...current, prescriptions })),
          true
        );
        load<LabOrder[]>(
          '/api/lab-orders',
          labs => setData(current => ({ ...current, labs })),
          true
        );
      }
      await Promise.all(requests);
      if (!active.current) return;
      setLoadError([...new Set(errors)].join(' '));
      if (includeRecords) setRecordsError([...new Set(clinicalErrors)].join(' '));
      if (!errors.length) setLastSynced(new Date());
      setLoading(false);
    };
    refreshing.current = run();
    try {
      await refreshing.current;
    } finally {
      refreshing.current = null;
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void refresh(true);
    const update = () => {
      if (document.visibilityState === 'visible') void refresh(sectionRef.current === 'records');
    };
    const interval = window.setInterval(update, 15000);
    let changedTimer: number | undefined;
    let pendingClinicalRefresh = false;
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string; path?: string }>).detail;
      const clinicalChange =
        ['patient_visits', 'prescriptions', 'lab_orders'].includes(detail?.table ?? '') ||
        /^\/api\/(patient-visits|prescriptions|lab-orders)(\/|$)/.test(detail?.path ?? '');
      pendingClinicalRefresh ||= clinicalChange;
      window.clearTimeout(changedTimer);
      changedTimer = window.setTimeout(() => {
        const includeRecords = sectionRef.current === 'records' || pendingClinicalRefresh;
        pendingClinicalRefresh = false;
        void refresh(includeRecords);
      }, 250);
    };
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('clinic:data-changed', onChanged);
    return () => {
      active.current = false;
      window.clearInterval(interval);
      window.clearTimeout(changedTimer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('clinic:data-changed', onChanged);
    };
  }, [refresh]);

  const setSection = (section: PatientSection) => {
    setActiveSection(section);
    setSidebarOpen(false);
    setError('');
    setMessage('');
    if (section === 'records') void refresh(true);
  };
  const cancelAppointment = async (id: string) => {
    setError('');
    setMessage('');
    try {
      await apiRequest(`/api/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      setMessage('Appointment cancelled.');
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to cancel appointment.'
      );
    }
  };
  const markRead = async (id: string) => {
    setError('');
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to update notification.'
      );
    }
  };
  const markAllRead = async () => {
    setError('');
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to update notifications.'
      );
    }
  };

  const content =
    activeSection === 'dashboard' ? (
      <PatientOverview
        profile={profile}
        appointments={data.appointments}
        doctors={data.doctors}
        notifications={data.notifications}
        onNavigate={setSection}
        onCancel={cancelAppointment}
        onUpdated={() => void refresh()}
      />
    ) : activeSection === 'book' ? (
      <Booking
        doctors={data.doctors}
        initialDoctorId={selectedDoctorId}
        settings={settings}
        onBooked={async () => {
          await refresh();
          setSection('appointments');
          setMessage('Appointment requested. The clinic will confirm your booking.');
        }}
      />
    ) : activeSection === 'appointments' ? (
      <AppointmentsView
        appointments={data.appointments}
        onCancel={cancelAppointment}
        doctors={data.doctors}
        onUpdated={() => void refresh()}
      />
    ) : activeSection === 'doctors' ? (
      <DoctorsView
        key={directoryQuery}
        doctors={data.doctors}
        initialQuery={directoryQuery}
        onBook={id => {
          setSelectedDoctorId(id);
          setSection('book');
        }}
      />
    ) : activeSection === 'records' ? (
      <HealthRecordsView
        visits={data.visits}
        prescriptions={data.prescriptions}
        labs={data.labs}
        onRefresh={() => void refresh(true)}
      />
    ) : activeSection === 'profile' ? (
      <ProfileView profile={profile} />
    ) : (
      <NotificationsView
        notifications={data.notifications}
        onRead={markRead}
        onReadAll={markAllRead}
      />
    );

  return (
    <PatientTimezoneContext.Provider value={timezone}>
      <div className="patient-shell">
        <aside id="patient-sidebar" className={`patient-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <SidebarBrand workspace="Patient Portal" />
          <nav>
            {navItems.map(item => (
              <button
                className={activeSection === item.id ? 'active' : ''}
                key={item.id}
                onClick={() => setSection(item.id)}
              >
                <item.icon size={20} />
                <span>{item.label}</span>
                {item.id === 'notifications' &&
                  data.notifications.some(notice => !notice.read_at) && (
                    <b>{data.notifications.filter(notice => !notice.read_at).length}</b>
                  )}
                {activeSection === item.id && <ChevronRight size={17} />}
              </button>
            ))}
          </nav>
          <button className="patient-logout" onClick={signOut}>
            <LogOut size={20} />
            Logout
          </button>
        </aside>
        {sidebarOpen && <div className="patient-overlay" onClick={() => setSidebarOpen(false)} />}
        <main className="patient-main">
          <header className="patient-topbar">
            <button
              className="patient-menu"
              onClick={() => setSidebarOpen(value => !value)}
              aria-label="Toggle menu"
            aria-expanded={sidebarOpen}
            aria-controls="patient-sidebar"
            >
              {sidebarOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
            <form
              className="patient-top-search"
              onSubmit={event => {
                event.preventDefault();
                setDirectoryQuery(search.trim());
                setSection('doctors');
              }}
            >
              <Search size={18} />
              <input
                type="search"
                aria-label="Search clinic doctors"
                placeholder="Search clinic doctors"
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
              <button className="patient-secondary" type="submit">
                Search
              </button>
            </form>
            <div className="patient-top-actions">
              <button
                className="patient-secondary"
                aria-label="Refresh clinic data"
                onClick={() => void refresh(activeSection === 'records')}
              >
                <RefreshCw size={16} />
              </button>
              <div className="patient-date">
                <Calendar size={17} />
                {clinicDate(new Date(), timezone)}
              </div>
              <button
                className="notification-button"
                onClick={() => setSection('notifications')}
                aria-label="Notifications"
              >
                <Bell size={19} />
              </button>
              <div className="patient-user">
                <Avatar name={profile?.full_name || profile?.email || 'Patient'} />
                <span>
                  <strong>{profile?.full_name || profile?.email}</strong>
                  <small>{profile?.user_type || 'Patient'}</small>
                </span>
              </div>
            </div>
          </header>
          {loadError && (
            <div className="patient-error" role="alert">
              {loadError}
              <button className="patient-secondary" onClick={() => void refresh()}>
                Retry
              </button>
            </div>
          )}
          {activeSection === 'records' && recordsError && (
            <div className="patient-error" role="alert">
              {recordsError}
              <button className="patient-secondary" onClick={() => void refresh(true)}>
                Retry health records
              </button>
            </div>
          )}
          {error && (
            <div className="patient-error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <p className="patient-success" role="status">
              {message}
            </p>
          )}
          {loading ? (
            <div className="patient-content" aria-live="polite">
              Loading your clinic data…
            </div>
          ) : (
            content
          )}
          {lastSynced && (
            <p className="dashboard-sync">
              Last synced {clinicTime(lastSynced, timezone)} · Updates every 15 seconds · {timezone}
            </p>
          )}
        </main>
      </div>
    </PatientTimezoneContext.Provider>
  );
}
