import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import BrandPanel from './components/BrandPanel';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import DoctorDashboard from './components/DoctorDashboard';
import PatientDashboard from './components/PatientDashboard';
import ReceptionistDashboard from './components/ReceptionistDashboard';
import PasswordRecoveryScreen from './components/PasswordRecoveryScreen';
import RegistrationScreen from './components/RegistrationScreen';

type View = 'register' | 'login';

function PortalContent() {
  const { session, profile, loading, otpVerified, otpError, signOut, passwordRecoveryRequired, invitationSetupRequired } = useAuth();
  const [view, setView] = useState<View>('login');

  if (passwordRecoveryRequired || invitationSetupRequired) return <PasswordRecoveryScreen invitation={invitationSetupRequired} />;

  // Keep the login form mounted while its sign-in/profile requests finish.
  // Unmounting it here discards the selected role and any login error.
  if (loading && (!session || otpVerified)) {
    return (
      <main className="portal-shell">
        <BrandPanel />
        <section className="form-panel">
          <div className="form-card" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div className="loading-spinner" />
            <p style={{ color: '#9ea5b0', marginTop: '20px', fontSize: '14px' }}>Loading...</p>
          </div>
        </section>
      </main>
    );
  }

  if (session && otpVerified && profile?.role === 'admin') {
    return <AdminDashboard />;
  }

  if (session && otpVerified && profile?.role === 'doctor') {
    return <DoctorDashboard />;
  }

  if (session && otpVerified && profile && ['patient', 'student', 'lecturer', 'staff'].includes(profile.role)) {
    return <PatientDashboard />;
  }

  if (session && otpVerified && profile?.role === 'receptionist') {
    return <ReceptionistDashboard />;
  }

  if (session && otpVerified) {
    return (
      <main className="portal-shell">
        <BrandPanel />
        <section className="form-panel">
          {profile ? <Dashboard /> : <div className="form-card">
            <div className="form-heading"><h2>Account profile unavailable</h2><p>{otpError || 'Your account profile could not be loaded. Contact the clinic administrator.'}</p></div>
            <div className="form-footer">
              <button className="secondary-button" type="button" onClick={() => void signOut()}>Sign out</button>
              <button className="primary-button" type="button" onClick={() => window.location.reload()}>Retry</button>
            </div>
          </div>}
        </section>
      </main>
    );
  }

  return (
    <main className="portal-shell">
      <BrandPanel />
      <section className="form-panel">
        {view === 'login' ? (
          <LoginScreen onSwitchToRegister={() => setView('register')} />
        ) : (
          <RegistrationScreen onSwitchToLogin={() => setView('login')} />
        )}
      </section>
    </main>
  );
}

function App() {
  return (
    <AuthProvider>
      <PortalContent />
    </AuthProvider>
  );
}

export default App;
