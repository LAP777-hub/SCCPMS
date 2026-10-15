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

export type OperationalReport = {
  from: string;
  to: string;
  timezone: string;
  appointments: number;
  completed: number;
  cancelled: number;
  no_show: number;
  pending: number;
  confirmed: number;
  in_progress: number;
  patients_seen: number;
  active_doctors: number;
  pending_leave: number;
  walk_ins: number;
  clinical_visits: number;
  prescriptions: number;
  lab_orders: number;
  daily_activity: Array<{ date: string; appointments: number; completed: number; cancelled: number; no_show: number; walk_ins: number }>;
  doctor_activity: Array<{ doctor_id: string; doctor_name: string; appointments: number; completed: number; cancelled: number; no_show: number }>;
  account_counts: { admin: number; doctor: number; receptionist: number; patient: number; inactive: number; deleted: number };
  account_activity: Array<{ action: string; count: number }>;
};
