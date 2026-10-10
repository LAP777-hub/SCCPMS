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

type View = 'register' | 'login';

function PortalContent() {
  const { session, profile, loading, otpVerified, passwordRecoveryRequired, invitationSetupRequired } = useAuth();
  const [view, setView] = useState<View>('login');

  if (passwordRecoveryRequired || invitationSetupRequired) return <PasswordRecoveryScreen invitation={invitationSetupRequired} />;

  if (loading) {
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

  if (session && otpVerified && profile?.role === 'patient') {
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
          <Dashboard />
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
          <div className="form-card">
            <div className="form-heading"><span className="mobile-kicker">ACCOUNT ACCESS</span><h2>Invitation Required</h2><p>Patient accounts are currently created by authorized clinic staff while university identity verification is being configured.</p></div>
            <div className="success-state"><p>Contact the campus clinic or reception desk to request an account invitation using your university email and phone number.</p><button className="primary-button" type="button" onClick={() => setView('login')}>Return to sign in</button></div>
          </div>
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
