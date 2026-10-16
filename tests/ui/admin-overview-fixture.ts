import type { AdminOverviewData } from '../../src/lib/admin-overview';

// Synthetic fixture data only. Production statistics are always queried by SQL.
export function emptyOverview(patients = 0): AdminOverviewData {
  const dates = Array.from({ length: 7 }, (_, i) => `2026-10-${12 + i}`);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const trend = () => dates.map((date, i) => ({ date, label: days[i], value: 0 }));
  return {
    timezone: 'Africa/Johannesburg', generatedAt: '2026-10-16T08:00:00Z',
    totals: { patients, doctors: 0, appointments: 0, medicalRecords: 0 },
    trends: { patients: trend(), doctors: trend(), appointments: trend(), medicalRecords: trend() },
    weeklyAppointments: dates.map((date, i) => ({ date, day: days[i], count: 0 })),
    demographics: [{ category: 'Students', count: patients }, { category: 'Employees', count: 0 }, { category: 'Faculty', count: 0 }, { category: 'Others', count: 0 }],
    recentAppointments: [], todayTimeline: [],
    finances: { available: false, currency: 'ZAR', income: 0, expenses: 0, net: 0, series: [] },
  };
}
