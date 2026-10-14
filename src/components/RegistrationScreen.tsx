import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, UserPlus } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { FACULTIES, isValidFacultyProgramme } from '../lib/academicCatalogue';
import ProgrammeCombobox from './ProgrammeCombobox';
import ResidentialAddressInput, { type ResidentialAddressValue } from './ResidentialAddressInput';
import PasswordToggle from './PasswordToggle';

export default function RegistrationScreen({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { signUp } = useAuth();
  const [userType, setUserType] = useState('Student');
  const [department, setDepartment] = useState('');
  const [programme, setProgramme] = useState('');
  const [residentialAddress, setResidentialAddress] = useState<ResidentialAddressValue>({ text: '', selection: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const value = (key: string) => String(fields.get(key) || '').trim();
    const password = String(fields.get('password') || '');
    if (password !== String(fields.get('confirmation') || '')) { setError('Passwords do not match.'); return; }
    if (userType === 'Student' && !isValidFacultyProgramme(department, programme)) { setError('Select your department and a programme belonging to it.'); return; }
    if (userType === 'Student' && !value('addressLine1')) { setError('Enter your residential address.'); return; }
    setBusy(true); setError('');
    try {
      const result = await signUp({
        email: value('email'), password, fullName: value('fullName'), phone: value('phone'), userType,
        studentNumber: userType === 'Student' ? value('identityNumber') : undefined,
        staffNumber: userType !== 'Student' ? value('identityNumber') : undefined,
        department, program: userType === 'Student' ? programme : undefined, addressLine1: value('addressLine1'),
        addressLatitude: residentialAddress.selection?.latitude,
        addressLongitude: residentialAddress.selection?.longitude,
        addressSource: residentialAddress.selection ? 'photon' : 'manual',
      });
      if (result.error) setError(result.error);
      else setMessage(result.message || 'Account created. Sign in and enter the verification code sent to your email.');
    } finally { setBusy(false); }
  }

  if (message) return <div className="form-card">
    <div className="form-heading"><span className="mobile-kicker">PATIENT REGISTRATION</span><h2>Check your account</h2></div>
    <div className="success-state"><CheckCircle2 size={38} /><p>{message}</p>
      <button className="primary-button" onClick={onSwitchToLogin} type="button">Return to sign in <ArrowRight size={18} /></button>
    </div>
  </div>;

  return <div className="form-card">
    <div className="form-heading"><span className="mobile-kicker">PATIENT REGISTRATION</span><h2>Create your clinic account</h2><p>Register as a university student or staff patient. Doctors and receptionists receive an invitation from the clinic.</p></div>
    <form onSubmit={submit}>
      <div className="section-heading"><span className="section-icon"><UserPlus size={22} /></span><div><h3>Your university details</h3><p>Use an email address you can access for verification and a phone number for clinic contact.</p></div></div>
      <div className="fields-grid">
        <label className="field-group field-wide"><span className="field-label">Full name</span><span className="field-control"><input name="fullName" autoComplete="name" required minLength={2} maxLength={160} /></span></label>
        <label className="field-group"><span className="field-label">Email address</span><span className="field-control"><input name="email" type="email" autoComplete="email" required maxLength={254} /></span></label>
        <label className="field-group"><span className="field-label">Phone (international format)</span><span className="field-control"><input name="phone" type="tel" autoComplete="tel" placeholder="+27123456789" pattern="\+[1-9][0-9]{7,14}" required /></span></label>
        <label className="field-group"><span className="field-label">University affiliation</span><span className="field-control"><select value={userType} onChange={event => { setUserType(event.target.value); setProgramme(''); }}><option>Student</option><option>Lecturer</option><option>SPU Staff</option></select></span></label>
        <label className="field-group"><span className="field-label">{userType === 'Student' ? 'Student number' : 'Staff number'}</span><span className="field-control"><input name="identityNumber" key={userType} required maxLength={40} /></span></label>
        <div className="field-group"><label className="field-label" htmlFor="registration-department">Department</label><span className="field-control"><select id="registration-department" name="department" value={department} required={userType === 'Student'} onChange={event => { setDepartment(event.target.value); setProgramme(''); }}>
          <option value="">Select your department</option>
          {FACULTIES.map(faculty => <option key={faculty.code} value={faculty.code}>{faculty.label}</option>)}
        </select></span></div>
        {userType === 'Student' && <div className="field-group"><label className="field-label" htmlFor="registration-programme">Programme</label>
          <ProgrammeCombobox id="registration-programme" facultyCode={department} value={programme} onChange={setProgramme} required disabled={busy} />
        </div>}
        <div className="field-group field-wide"><label className="field-label" htmlFor="registration-address">Residential Address</label>
          <ResidentialAddressInput id="registration-address" value={residentialAddress} onChange={setResidentialAddress} required={userType === 'Student'} disabled={busy} />
        </div>
        <div className="field-group"><label className="field-label" htmlFor="registration-password">Password (at least 10 characters)</label><span className="field-control"><input id="registration-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={10} maxLength={128} /><PasswordToggle inputId="registration-password" fieldName="password" visible={showPassword} onToggle={() => setShowPassword(value => !value)} disabled={busy} /></span></div>
        <div className="field-group"><label className="field-label" htmlFor="registration-confirmation">Confirm password</label><span className="field-control"><input id="registration-confirmation" name="confirmation" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" required minLength={10} maxLength={128} /><PasswordToggle inputId="registration-confirmation" fieldName="confirm password" visible={showConfirmation} onToggle={() => setShowConfirmation(value => !value)} disabled={busy} /></span></div>
      </div>
      {error && <div className="login-error" role="alert">{error}</div>}
      <div className="form-footer"><button className="secondary-button" type="button" onClick={onSwitchToLogin} disabled={busy}><ArrowLeft size={18} />Back</button><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Creating account...' : 'Create account'}<ArrowRight size={18} /></button></div>
    </form>
    <div className="privacy-note"><LockKeyhole size={14} />Confirm your email and enter an email verification code at sign-in.</div>
  </div>;
}
