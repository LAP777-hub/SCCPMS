import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Activity,
  Bell,
  Calendar,
  CalendarCheck,
  Check,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import ProfilePhoto from './ProfilePhoto';
import { apiRequest } from '../lib/api';
import SidebarBrand from './SidebarBrand';
import {
  calendarDate,
  campusTimezone,
  clinicDate,
  clinicDateTime,
  clinicInstant,
  clinicTime,
  requestMessage,
  type ClinicSettings,
} from '../lib/dashboardTime';
import DoctorClinicalWorkflow, {
  type ClinicalVisit,
  type ClinicalPrescription,
  type ClinicalLab,
} from './DoctorClinicalWorkflow';
import './ClinicalDashboards.css';

type DoctorSection =
  'overview' | 'appointments' | 'records' | 'queue' | 'schedule' | 'leave' | 'notifications';
type Appointment = {
  id: string;
  patient_name: string;
  patient_user_id: string;
  consultation_type: string;
  starts_at: string;
  ends_at: string;
  mode: string;
  status: string;
  reason: string | null;
};
type Notification = {
  id: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};
type LeaveRequest = {
  id: string;
  starts_on: string;
  ends_on: string;
  leave_type: string;
  reason: string;
  status: string;
  review_note: string | null;
};
type DoctorAccount = { id: string; user_id: string; full_name: string; specialty: string };
type AvailabilitySlot = {
  id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
};
type WalkIn = {
  id: string;
  patient_user_id: string | null;
  appointment_id: string | null;
  patient_name: string;
  reason: string;
  urgency: string;
  status: string;
  arrived_at: string;
};

const navItems: { id: DoctorSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'appointments', label: 'Appointments', icon: CalendarCheck },
  { id: 'records', label: 'Clinical Records', icon: FileText },
  { id: 'queue', label: 'Assigned Walk-ins', icon: Users },
  { id: 'schedule', label: 'My Availability', icon: Calendar },
  { id: 'leave', label: 'Leave Requests', icon: Calendar },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

export default function DoctorDashboard() {
  const { profile, signOut } = useAuth();
  const [section, setSection] = useState<DoctorSection>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [doctorRecord, setDoctorRecord] = useState<DoctorAccount | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [walkIns, setWalkIns] = useState<WalkIn[]>([]);
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [visits, setVisits] = useState<ClinicalVisit[]>([]);
  const [prescriptions, setPrescriptions] = useState<ClinicalPrescription[]>([]);
  const [labs, setLabs] = useState<ClinicalLab[]>([]);
  const [availabilityDate, setAvailabilityDate] = useState(() => clinicDate());
  const [editingSlot, setEditingSlot] = useState<AvailabilitySlot | null>(null);
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState('');
  const [leaveStart, setLeaveStart] = useState(() => clinicDate());
  const [leaveEnd, setLeaveEnd] = useState(() => clinicDate());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [recordsError, setRecordsError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [visitAppointmentId, setVisitAppointmentId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const active = useRef(false);
  const sectionRef = useRef(section);
  const visitRef = useRef(visitAppointmentId);
  sectionRef.current = section;
  visitRef.current = visitAppointmentId;
  const refreshing = useRef<Promise<void> | null>(null);
  const timezone = settings?.timezone ?? campusTimezone;
  const today = clinicDate(new Date(), timezone);

  const refresh = useCallback(
    async (includeClinical = false): Promise<void> => {
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
        load<Appointment[]>('/api/appointments', setAppointments);
        load<Notification[]>('/api/notifications', setNotifications);
        load<LeaveRequest[]>('/api/leave-requests', setLeaveRequests);
        load<DoctorAccount[]>('/api/doctors', data =>
          setDoctorRecord(data.find(doctor => doctor.user_id === profile?.id) ?? null)
        );
        load<AvailabilitySlot[]>('/api/availability-slots', setAvailability);
        load<WalkIn[]>('/api/walk-ins', setWalkIns);
        load<ClinicSettings>('/api/clinic/settings', setSettings);
        if (includeClinical) {
          load<ClinicalVisit[]>('/api/patient-visits', setVisits, true);
          load<ClinicalPrescription[]>('/api/prescriptions', setPrescriptions, true);
          load<ClinicalLab[]>('/api/lab-orders', setLabs, true);
        }
        await Promise.all(requests);
        if (!active.current) return;
        setLoadError([...new Set(errors)].join(' '));
        if (includeClinical) setRecordsError([...new Set(clinicalErrors)].join(' '));
        if (!errors.length) setLastSynced(new Date());
        setLoading(false);
      };
      refreshing.current = run();
      try {
        await refreshing.current;
      } finally {
        refreshing.current = null;
      }
    },
    [profile?.id]
  );

  useEffect(() => {
    active.current = true;
    void refresh(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(sectionRef.current === 'records' || !!visitRef.current);
    }, 15000);
    const onFocus = () => {
      if (document.visibilityState === 'visible') void refresh(sectionRef.current === 'records' || !!visitRef.current);
    };
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
        const includeClinical =
          (pendingClinicalRefresh || !detail?.table) &&
          (sectionRef.current === 'records' ||
            (['overview', 'appointments'].includes(sectionRef.current) && !!visitRef.current));
        pendingClinicalRefresh = false;
        void refresh(includeClinical);
      }, 250);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('clinic:data-changed', onChanged);
    return () => {
      active.current = false;
      window.clearInterval(interval);
      window.clearTimeout(changedTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('clinic:data-changed', onChanged);
    };
  }, [refresh]);

  async function mutate(
    key: string,
    path: string,
    method: string,
    values?: object,
    success = 'Changes saved.'
  ) {
    if (busy) return false;
    setBusy(key);
    setActionError('');
    setMessage('');
    try {
      await apiRequest(path, { method, ...(values ? { body: JSON.stringify(values) } : {}) });
      setMessage(success);
      await refresh();
      return true;
    } catch (error) {
      setActionError(requestMessage(error, 'Unable to save changes.'));
      return false;
    } finally {
      setBusy('');
    }
  }

  async function saveAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!doctorRecord || !settings || busy) return;
    setActionError('');
    try {
      const startsAt = clinicInstant(availabilityDate, startTime, timezone);
      const minutes = Number(duration || settings.default_appointment_minutes);
      if (!Number.isInteger(minutes) || minutes < 10 || minutes > 30)
        throw new Error('Choose a duration between 10 and 30 minutes.');
      if (startsAt.getTime() <= Date.now())
        throw new Error('Availability must start in the future.');
      const endsAt = new Date(startsAt.getTime() + minutes * 60000);
      const saved = await mutate(
        'availability',
        editingSlot ? `/api/availability-slots/${editingSlot.id}` : '/api/availability-slots',
        editingSlot ? 'PATCH' : 'POST',
        {
          ...(editingSlot ? {} : { doctorId: doctorRecord.id }),
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        },
        editingSlot ? 'Availability updated.' : 'Availability added.'
      );
      if (saved) {
        setEditingSlot(null);
        setStartTime('');
      }
    } catch (error) {
      setActionError(requestMessage(error, 'Unable to save availability.'));
    }
  }

  async function startWalkIn(item: WalkIn) {
    if (busy) return;
    if (!item.patient_user_id) {
      setActionError(
        'The receptionist must register this patient and link their clinic account before a clinical consultation can begin.'
      );
      return;
    }
    setBusy(item.id);
    setActionError('');
    setMessage('');
    try {
      const result = await apiRequest<{ data: { appointmentId: string } }>(
        `/api/walk-ins/${item.id}/consultation`,
        { method: 'POST' }
      );
      await refresh(true);
      setSection('appointments');
      setVisitAppointmentId(result.data.appointmentId);
      setMessage(
        'Walk-in consultation started. Record the clinical visit, prescriptions and laboratory orders here.'
      );
    } catch (error) {
      setActionError(requestMessage(error, 'Unable to start this walk-in consultation.'));
    } finally {
      setBusy('');
    }
  }

  async function submitLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const values = Object.fromEntries(new FormData(formElement).entries());
    if (leaveEnd < leaveStart) {
      setActionError('Leave end date must be on or after its start date.');
      return;
    }
    const saved = await mutate(
      'leave',
      '/api/leave-requests',
      'POST',
      { ...values, startsOn: leaveStart, endsOn: leaveEnd },
      'Leave request submitted for review.'
    );
    if (saved) formElement.reset();
  }

  const unread = notifications.filter(item => !item.read_at).length;
  const upcoming = appointments.filter(
    item =>
      ['pending', 'confirmed'].includes(item.status) &&
      new Date(item.ends_at).getTime() > Date.now()
  );
  const activeItem = navItems.find(item => item.id === section);
  const visibleAppointments = appointments.filter(item =>
    `${item.patient_name} ${item.consultation_type} ${item.status} ${item.reason ?? ''}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const dayAvailability = availability.filter(
    slot => clinicDate(slot.starts_at, timezone) === availabilityDate
  );
  const dayOnLeave = leaveRequests.some(
    request =>
      request.status === 'approved' &&
      calendarDate(request.starts_on) <= availabilityDate &&
      calendarDate(request.ends_on) >= availabilityDate
  );
  const workflow = (appointmentId: string) => (
    <DoctorClinicalWorkflow
      key={appointmentId}
      appointmentId={appointmentId}
      existingVisit={visits.find(visit => visit.appointment_id === appointmentId)}
      prescriptions={prescriptions}
      labs={labs}
      timezone={timezone}
      onSaved={() => refresh(true)}
    />
  );

  const appointmentsTable = (
    <div className="doctor-panel doctor-appointments-panel">
      <div className="doctor-panel-header">
        <h2>
          <CalendarCheck size={18} />
          Assigned Appointments
        </h2>
      </div>
      <label className="doctor-table-search">
        Search appointments
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          type="search"
          placeholder="Patient, consultation, reason or status"
        />
      </label>
      {!visibleAppointments.length ? (
        <div className="doctor-empty-state">
          {appointments.length
            ? 'No appointments match your search.'
            : 'No appointments are assigned to your account.'}
        </div>
      ) : (
        <div className="doctor-table-wrap">
          <table className="admin-table doctor-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Consultation</th>
                <th>Clinic date and time</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleAppointments.map(appointment => (
                <Fragment key={appointment.id}>
                  <tr>
                    <td>
                      <strong>{appointment.patient_name}</strong>
                      {appointment.reason && (
                        <small className="doctor-detail-text">{appointment.reason}</small>
                      )}
                    </td>
                    <td>{appointment.consultation_type}</td>
                    <td>
                      {clinicDateTime(appointment.starts_at, timezone)}
                      <small className="doctor-detail-text">
                        Until {clinicTime(appointment.ends_at, timezone)}
                      </small>
                    </td>
                    <td>{appointment.mode === 'in_person' ? 'In person' : 'Telehealth'}</td>
                    <td>
                      <span
                        className={`admin-status-pill ${appointment.status.replace(/_/g, '-')}`}
                      >
                        {appointment.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="doctor-action-row">
                        {appointment.status === 'pending' && (
                          <button
                            className="doctor-btn-primary"
                            disabled={!!busy}
                            onClick={() =>
                              void mutate(
                                appointment.id,
                                `/api/appointments/${appointment.id}/status`,
                                'PATCH',
                                { status: 'confirmed' },
                                'Appointment confirmed.'
                              )
                            }
                          >
                            Confirm
                          </button>
                        )}
                        {['pending', 'confirmed'].includes(appointment.status) && (
                          <button
                            className="doctor-btn-secondary"
                            disabled={!!busy}
                            onClick={() =>
                              void mutate(
                                appointment.id,
                                `/api/appointments/${appointment.id}/status`,
                                'PATCH',
                                { status: 'cancelled' },
                                'Appointment cancelled.'
                              )
                            }
                          >
                            Cancel
                          </button>
                        )}
                        {appointment.status === 'confirmed' && (
                          <>
                            <button
                              className="doctor-btn-primary"
                              disabled={!!busy}
                              onClick={() =>
                                void mutate(
                                  appointment.id,
                                  `/api/appointments/${appointment.id}/status`,
                                  'PATCH',
                                  { status: 'in_progress' },
                                  'Visit started.'
                                )
                              }
                            >
                              Start visit
                            </button>
                            <button
                              className="doctor-btn-secondary"
                              disabled={
                                !!busy || new Date(appointment.starts_at).getTime() > Date.now()
                              }
                              onClick={() =>
                                void mutate(
                                  appointment.id,
                                  `/api/appointments/${appointment.id}/status`,
                                  'PATCH',
                                  { status: 'no_show' },
                                  'Appointment marked no show.'
                                )
                              }
                            >
                              No show
                            </button>
                          </>
                        )}
                        {['in_progress', 'completed'].includes(appointment.status) && (
                          <button
                            className="doctor-btn-secondary"
                            onClick={() => {
                              setVisitAppointmentId(
                                visitAppointmentId === appointment.id ? null : appointment.id
                              );
                              void refresh(true);
                            }}
                          >
                            {visitAppointmentId === appointment.id
                              ? 'Close record'
                              : 'Clinical record'}
                          </button>
                        )}
                        {appointment.status === 'in_progress' && (
                          <button
                            className="doctor-btn-primary"
                            disabled={
                              !!busy ||
                              !visits.some(visit => visit.appointment_id === appointment.id)
                            }
                            title={
                              visits.some(visit => visit.appointment_id === appointment.id)
                                ? 'Complete visit'
                                : 'Save the clinical visit before completing'
                            }
                            onClick={() =>
                              void mutate(
                                appointment.id,
                                `/api/appointments/${appointment.id}/status`,
                                'PATCH',
                                { status: 'completed' },
                                'Visit completed.'
                              )
                            }
                          >
                            <Check size={15} />
                            Complete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {visitAppointmentId === appointment.id && (
                    <tr>
                      <td colSpan={6}>{workflow(appointment.id)}</td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const content =
    section === 'appointments' ? (
      <section className="admin-section">
        <div className="doctor-section-heading">
          <div>
            <h1>Appointments</h1>
            <p>Manage assigned consultations and record clinical visits. Times use {timezone}.</p>
          </div>
        </div>
        {appointmentsTable}
      </section>
    ) : section === 'records' ? (
      <section className="admin-section">
        <div className="doctor-section-heading">
          <div>
            <h1>Clinical Records</h1>
            <p>Your saved SOAP notes, prescriptions and laboratory results.</p>
          </div>
          <button className="doctor-btn-secondary" onClick={() => void refresh(true)}>
            Refresh records
          </button>
        </div>
        {!visits.length ? (
          <div className="doctor-panel doctor-empty-state">
            No clinical visits have been recorded by your account. Start an assigned appointment to
            document a visit.
          </div>
        ) : (
          visits.map(visit => (
            <section className="doctor-panel" key={visit.id}>
              <div className="doctor-record-entry">
                <h3>
                  {appointments.find(item => item.id === visit.appointment_id)?.patient_name ??
                    'Clinical visit'}{' '}
                  · {clinicDateTime(visit.visit_date, timezone)}
                </h3>
                <p>{visit.chief_complaint}</p>
                <button
                  className="doctor-btn-secondary"
                  onClick={() =>
                    setVisitAppointmentId(
                      visitAppointmentId === visit.appointment_id ? null : visit.appointment_id
                    )
                  }
                >
                  {visitAppointmentId === visit.appointment_id
                    ? 'Close documentation'
                    : 'Open documentation and orders'}
                </button>
              </div>
              {visitAppointmentId === visit.appointment_id && workflow(visit.appointment_id)}
            </section>
          ))
        )}
      </section>
    ) : section === 'queue' ? (
      <section className="admin-section">
        <div className="doctor-section-heading">
          <div>
            <h1>Assigned Walk-ins</h1>
            <p>Patients assigned to you by the front desk.</p>
          </div>
        </div>
        <div className="doctor-panel">
          {!walkIns.length ? (
            <div className="doctor-empty-state">No walk-ins are currently assigned to you.</div>
          ) : (
            walkIns.map(item => (
              <article className="doctor-record-entry" key={item.id}>
                <h3>{item.patient_name}</h3>
                <p>{item.reason}</p>
                <small>
                  {item.urgency} priority · Arrived {clinicDateTime(item.arrived_at, timezone)} ·{' '}
                  {item.status.replace(/_/g, ' ')}
                </small>
                <div className="doctor-action-row">
                  {!item.appointment_id &&
                    ['assigned', 'triaged', 'in_progress'].includes(item.status) && (
                      <button
                        className="doctor-btn-primary"
                        disabled={!!busy || !item.patient_user_id}
                        onClick={() => void startWalkIn(item)}
                      >
                        Start consultation
                      </button>
                    )}
                  {item.appointment_id && (
                    <button
                      className="doctor-btn-primary"
                      disabled={!!busy}
                      onClick={() => {
                        setSection('appointments');
                        setVisitAppointmentId(item.appointment_id);
                        void refresh(true);
                      }}
                    >
                      Open clinical consultation
                    </button>
                  )}
                </div>
                {!item.patient_user_id && (
                  <p>
                    Reception must register this patient and link their clinic account before
                    clinical documentation can begin.
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    ) : section === 'schedule' ? (
      <section className="admin-section">
        <div className="doctor-section-heading">
          <div>
            <h1>My Availability</h1>
            <p>
              {settings
                ? `Clinic hours ${settings.opens_at.slice(0, 5)}–${settings.closes_at.slice(0, 5)} · ${timezone}. Approved leave and holidays close booking.`
                : 'Loading clinic settings…'}
            </p>
          </div>
        </div>
        {!doctorRecord && (
          <div className="doctor-error" role="alert">
            Your clinician directory profile is not active. Contact an administrator.
          </div>
        )}
        {doctorRecord && settings && (
          <>
            {dayOnLeave && (
              <p className="doctor-error" role="status">
                Approved leave covers this date. Patient booking is closed for your availability on
                this day.
              </p>
            )}
            <form className="doctor-panel doctor-form-grid" onSubmit={saveAvailability}>
              <label>
                Date
                <input
                  type="date"
                  min={today}
                  value={availabilityDate}
                  onChange={event => {
                    setAvailabilityDate(event.target.value);
                    setEditingSlot(null);
                    setStartTime('');
                  }}
                  required
                />
              </label>
              <label>
                Start time ({timezone})
                <input
                  type="time"
                  value={startTime}
                  onChange={event => setStartTime(event.target.value)}
                  min={settings.opens_at.slice(0, 5)}
                  max={settings.closes_at.slice(0, 5)}
                  required
                />
              </label>
              <label>
                Duration (minutes)
                <input
                  type="number"
                  min="10"
                  max="30"
                  value={duration || settings.default_appointment_minutes}
                  onChange={event => setDuration(event.target.value)}
                  required
                />
              </label>
              <div className="doctor-action-row">
                <button
                  className="doctor-btn-primary"
                  disabled={!!busy || !availabilityDate || dayOnLeave}
                >
                  {busy === 'availability'
                    ? 'Saving…'
                    : editingSlot
                      ? 'Save slot changes'
                      : 'Add appointment slot'}
                </button>
                {editingSlot && (
                  <button
                    className="doctor-btn-secondary"
                    type="button"
                    onClick={() => {
                      setEditingSlot(null);
                      setStartTime('');
                    }}
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
            <div className="doctor-panel">
              <h2>Schedule for {availabilityDate}</h2>
              {dayAvailability.length ? (
                dayAvailability.map(slot => (
                  <div className="doctor-request" key={slot.id}>
                    <span>
                      {clinicTime(slot.starts_at, timezone)}–{clinicTime(slot.ends_at, timezone)}
                    </span>
                    <span className={`admin-status-pill ${slot.status}`}>{slot.status}</span>
                    {slot.status === 'available' && (
                      <div className="doctor-action-row">
                        <button
                          className="doctor-btn-secondary"
                          disabled={!!busy}
                          onClick={() => {
                            setEditingSlot(slot);
                            setStartTime(clinicTime(slot.starts_at, timezone));
                            setDuration(
                              String(
                                (new Date(slot.ends_at).getTime() -
                                  new Date(slot.starts_at).getTime()) /
                                  60000
                              )
                            );
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="doctor-btn-secondary"
                          disabled={!!busy}
                          onClick={() =>
                            void mutate(
                              slot.id,
                              `/api/availability-slots/${slot.id}`,
                              'DELETE',
                              undefined,
                              'Availability removed.'
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="doctor-empty-state">
                  No appointment slots are recorded for this date.
                </div>
              )}
            </div>
          </>
        )}
      </section>
    ) : section === 'leave' ? (
      <section className="admin-section">
        <div className="doctor-section-heading">
          <div>
            <h1>Leave Requests</h1>
            <p>Submit leave for review. Approved dates update booking availability.</p>
          </div>
        </div>
        <form className="doctor-panel doctor-form-grid" onSubmit={submitLeave}>
          <label>
            Start date
            <input
              name="startsOn"
              type="date"
              min={today}
              value={leaveStart}
              onChange={event => {
                setLeaveStart(event.target.value);
                if (leaveEnd < event.target.value) setLeaveEnd(event.target.value);
              }}
              required
            />
          </label>
          <label>
            End date
            <input
              name="endsOn"
              type="date"
              min={leaveStart}
              value={leaveEnd}
              onChange={event => setLeaveEnd(event.target.value)}
              required
            />
          </label>
          <label>
            Leave type
            <select name="leaveType">
              <option value="annual">Annual</option>
              <option value="sick">Sick</option>
              <option value="emergency">Emergency</option>
              <option value="personal">Personal</option>
            </select>
          </label>
          <label className="doctor-full-field">
            Reason
            <textarea name="reason" required maxLength={4000} />
          </label>
          <button className="doctor-btn-primary" disabled={!!busy}>
            {busy === 'leave' ? 'Submitting…' : 'Submit request'}
          </button>
        </form>
        <div className="doctor-panel">
          <h2>My requests</h2>
          {leaveRequests.length ? (
            leaveRequests.map(request => (
              <article className="doctor-record-entry" key={request.id}>
                <h3>{request.leave_type} leave</h3>
                <p>
                  {calendarDate(request.starts_on)} to {calendarDate(request.ends_on)}
                </p>
                <p>{request.reason}</p>
                <span className={`admin-status-pill ${request.status}`}>{request.status}</span>
                {request.review_note && <p>Review: {request.review_note}</p>}
                {(request.status === 'pending' ||
                  (request.status === 'approved' && calendarDate(request.starts_on) > today)) && (
                  <button
                    className="doctor-btn-secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void mutate(
                        request.id,
                        `/api/leave-requests/${request.id}`,
                        'DELETE',
                        undefined,
                        'Leave request withdrawn.'
                      )
                    }
                  >
                    Withdraw request
                  </button>
                )}
              </article>
            ))
          ) : (
            <div className="doctor-empty-state">No leave requests have been submitted.</div>
          )}
        </div>
      </section>
    ) : section === 'notifications' ? (
      <section className="admin-section">
        <div className="doctor-section-heading">
          <div>
            <h1>Notifications</h1>
            <p>Clinic activity updates refresh automatically while this page is open.</p>
          </div>
          <button
            className="doctor-btn-secondary"
            disabled={!!busy || !unread}
            onClick={() =>
              void mutate(
                'notifications',
                '/api/notifications/read-all',
                'POST',
                undefined,
                'Notifications marked as read.'
              )
            }
          >
            Mark all read
          </button>
        </div>
        <div className="doctor-panel">
          {!notifications.length ? (
            <div className="doctor-empty-state">No notifications yet.</div>
          ) : (
            notifications.map(item => (
              <button
                className={`doctor-notification ${item.read_at ? '' : 'unread'}`}
                key={item.id}
                disabled={!!busy || !!item.read_at}
                onClick={() =>
                  void mutate(
                    item.id,
                    `/api/notifications/${item.id}/read`,
                    'PATCH',
                    undefined,
                    'Notification marked as read.'
                  )
                }
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.message}</small>
                  <em>{clinicDateTime(item.created_at, timezone)}</em>
                </span>
              </button>
            ))
          )}
        </div>
      </section>
    ) : (
      <section className="admin-section">
        <div className="doctor-section-heading">
          <div>
            <h1>Doctor Dashboard</h1>
            <p>
              Clinic activity for {profile?.full_name || profile?.email}. Times use {timezone}.
            </p>
          </div>
          <Stethoscope className="doctor-heading-mark" size={28} />
        </div>
        <div className="doctor-stats-grid">
          <div className="doctor-stat-card red">
            <span className="doctor-stat-icon">
              <CalendarCheck size={23} />
            </span>
            <div>
              <small>Upcoming</small>
              <strong>{upcoming.length}</strong>
              <span>Pending or confirmed</span>
            </div>
          </div>
          <div className="doctor-stat-card orange">
            <span className="doctor-stat-icon">
              <Activity size={23} />
            </span>
            <div>
              <small>In progress</small>
              <strong>{appointments.filter(item => item.status === 'in_progress').length}</strong>
              <span>Visits underway</span>
            </div>
          </div>
          <div className="doctor-stat-card green">
            <span className="doctor-stat-icon">
              <Check size={23} />
            </span>
            <div>
              <small>Completed</small>
              <strong>{appointments.filter(item => item.status === 'completed').length}</strong>
              <span>Recorded appointments</span>
            </div>
          </div>
          <div className="doctor-stat-card gold">
            <span className="doctor-stat-icon">
              <Bell size={23} />
            </span>
            <div>
              <small>Unread notifications</small>
              <strong>{unread}</strong>
              <span>Clinic updates</span>
            </div>
          </div>
        </div>
        {appointmentsTable}
      </section>
    );

  return (
    <div className="admin-shell doctor-shell">
      <aside id="doctor-sidebar" className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <SidebarBrand workspace="Doctor Workspace" />
        <nav className="admin-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`admin-nav-item ${section === item.id ? 'active' : ''}`}
              onClick={() => {
                setSection(item.id);
                setSidebarOpen(false);
                setActionError('');
                setMessage('');
                if (item.id === 'records') void refresh(true);
              }}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.id === 'notifications' && unread > 0 && <b>{unread}</b>}
            </button>
          ))}
        </nav>
        <button className="admin-signout" onClick={() => void signOut()}>
          <LogOut size={20} />
          Sign Out
        </button>
      </aside>
      {sidebarOpen && (
        <div className="admin-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="admin-menu-btn"
            onClick={() => setSidebarOpen(value => !value)}
            aria-label="Toggle menu"
            aria-expanded={sidebarOpen}
            aria-controls="doctor-sidebar"
          >
            {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div className="admin-topbar-title">
            {activeItem && <activeItem.icon size={20} />}
            <h2>{activeItem?.label}</h2>
          </div>
          <div className="admin-topbar-actions">
            <button
              className="doctor-btn-secondary"
              aria-label="Refresh clinic data"
              onClick={() => void refresh(true)}
            >
              <RefreshCw size={16} />
            </button>
            <span className="doctor-date">
              <Calendar size={16} />
              {today}
            </span>
            <div className="admin-user-chip">
              <ProfilePhoto className="admin-user-avatar" />
              <div>
                <strong>{profile?.full_name || profile?.email}</strong>
                <small>Doctor</small>
              </div>
            </div>
          </div>
        </header>
        <div className="admin-content">
          {loadError && (
            <div className="doctor-error" role="alert">
              {loadError}
              <button className="doctor-btn-secondary" onClick={() => void refresh(true)}>
                Retry
              </button>
            </div>
          )}
          {actionError && (
            <div className="doctor-error" role="alert">
              {actionError}
            </div>
          )}
          {(section === 'records' || !!visitAppointmentId) && recordsError && (
            <div className="doctor-error" role="alert">
              {recordsError}
              <button className="doctor-btn-secondary" onClick={() => void refresh(true)}>
                Retry clinical records
              </button>
            </div>
          )}
          {message && (
            <p className="doctor-success" role="status">
              {message}
            </p>
          )}
          {loading ? (
            <div className="admin-section" aria-live="polite">
              Loading your clinic workspace…
            </div>
          ) : (
            content
          )}
          {lastSynced && (
            <p className="dashboard-sync">
              Last synced {clinicTime(lastSynced, timezone)} · Updates every 15 seconds
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
