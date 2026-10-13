export type ClinicAnalytics = {
  patients: number;
  doctors: number;
  staff: number;
  appointmentsToday: number;
  pendingAppointments: number;
  activeWalkIns: number;
  clinicalVisits: number;
  pendingLeaveRequests: number;
  dailyAppointments: Array<{ date: string; count: number }>;
};
