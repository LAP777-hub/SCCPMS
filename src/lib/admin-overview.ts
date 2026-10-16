export type OverviewTrend = { date: string; label: string; value: number };
export type OverviewAppointment = { id: string; startsAt: string; endsAt: string; status: string; consultationType: string; patientName: string; doctorName: string };
export type AdminOverviewData = {
  timezone: string;
  generatedAt: string;
  totals: { patients: number; doctors: number; appointments: number; medicalRecords: number };
  trends: { patients: OverviewTrend[]; doctors: OverviewTrend[]; appointments: OverviewTrend[]; medicalRecords: OverviewTrend[] };
  weeklyAppointments: Array<{ date: string; day: string; count: number }>;
  demographics: Array<{ category: 'Students' | 'Employees' | 'Faculty' | 'Others'; count: number }>;
  recentAppointments: OverviewAppointment[];
  todayTimeline: OverviewAppointment[];
  finances: { available: boolean; currency: string; income: number; expenses: number; net: number; series: number[] };
};
