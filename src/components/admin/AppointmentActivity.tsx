import type { ClinicAnalytics } from '../../lib/analytics';
export default function AppointmentActivity({ analytics }: { analytics: ClinicAnalytics | null }) {
  const days = Array.isArray(analytics?.dailyAppointments) ? analytics.dailyAppointments : [];
  const maximum = Math.max(1, ...days.map(day => day.count));
  return (
    <section className="clinic-ops">
      <h2>Appointment activity</h2>
      <p>Last seven clinic dates, excluding cancelled bookings.</p>
      {days.every(day => day.count === 0) ? (
        <p className="clinic-ops-empty">No appointment activity yet.</p>
      ) : (
        <div className="clinic-activity" aria-label="Daily appointment counts">
          {days.map(day => (
            <div className="clinic-activity-day" key={day.date}>
              <span>{day.date}</span>
              <div className="clinic-activity-track">
                <div style={{ width: `${(day.count / maximum) * 100}%` }} />
              </div>
              <strong>{day.count}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
