import {
  Briefcase,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import type { Role } from '../lib/supabase';

const roleLabels: Record<Role, { label: string; icon: typeof GraduationCap }> = {
  admin: { label: 'Admin', icon: ShieldCheck },
  doctor: { label: 'Doctor', icon: Stethoscope },
  patient: { label: 'Patient', icon: UserRound },
  receptionist: { label: 'Receptionist', icon: UsersRound },
  student: { label: 'Student', icon: GraduationCap },
  lecturer: { label: 'Lecturer', icon: UsersRound },
  staff: { label: 'SPU Staff', icon: Briefcase },
};

export default function Dashboard() {
  const { profile, signOut } = useAuth();

  if (!profile) return null;

  const roleInfo = roleLabels[profile.role];

  return (
    <div className="form-card dashboard-card">
      <div className="dashboard-header">
        <span className="mobile-kicker">SPU-SCCPMS DASHBOARD</span>
        <div className="dashboard-role-badge">
          <roleInfo.icon size={20} strokeWidth={1.6} />
          <span>{roleInfo.label}</span>
        </div>
      </div>

      <div className="dashboard-welcome">
        <span className="dashboard-icon"><LayoutDashboard size={32} /></span>
        <h2>Welcome to SPU-SCCPMS</h2>
        <p>You are signed in as a <strong>{roleInfo.label}</strong>.</p>
      </div>

      <div className="dashboard-info-grid">
        <div className="dashboard-info-item">
          <Mail size={18} strokeWidth={1.6} />
          <div>
            <small>Email</small>
            <strong>{profile.email}</strong>
          </div>
        </div>
        {profile.student_number && (
          <div className="dashboard-info-item">
            <GraduationCap size={18} strokeWidth={1.6} />
            <div>
              <small>Student Number</small>
              <strong>{profile.student_number}</strong>
            </div>
          </div>
        )}
        {profile.staff_number && (
          <div className="dashboard-info-item">
            <Briefcase size={18} strokeWidth={1.6} />
            <div>
              <small>Staff Number</small>
              <strong>{profile.staff_number}</strong>
            </div>
          </div>
        )}
        {profile.department && (
          <div className="dashboard-info-item">
            <ShieldCheck size={18} strokeWidth={1.6} />
            <div>
              <small>Faculty</small>
              <strong>{profile.department}</strong>
            </div>
          </div>
        )}
        {profile.program && (
          <div className="dashboard-info-item">
            <GraduationCap size={18} strokeWidth={1.6} />
            <div>
              <small>Programme</small>
              <strong>{profile.program}</strong>
            </div>
          </div>
        )}
      </div>

      <div className="dashboard-actions">
        <button className="secondary-button" type="button" onClick={signOut}>
          <LogOut size={19} /> Sign Out
        </button>
      </div>

      <div className="privacy-note"><ShieldCheck size={14} /> You are signed in. Your session is protected and encrypted.</div>
    </div>
  );
}
