import { useEffect, useState, type FormEvent } from 'react';
import { X, UserPlus, Mail, Phone, Stethoscope, UsersRound, ShieldCheck, Check, Loader2 } from 'lucide-react';
import { apiRequest } from '../../lib/api';

type StaffRole = 'doctor' | 'receptionist';

type Props = {
  open: boolean;
  onClose: () => void;
  defaultRole?: StaffRole;
};

const specialties = [
  'General Physician',
  'Dermatologist',
  'Orthopedic Surgeon',
  'Pediatrician',
  'OB-GYN',
  'Psychiatrist',
  'Dentist',
  'Internal Medicine',
  'Cardiologist',
  'Ophthalmologist',
];

const departments = [
  'General Medicine',
  'Dermatology',
  'Orthopedics',
  'Pediatrics',
  'Obstetrics & Gynecology',
  'Psychiatry',
  'Dentistry',
  'Internal Medicine',
  'Cardiology',
  'Ophthalmology',
  'Front Desk / Reception',
];

export default function StaffRegistrationModal({ open, onClose, defaultRole = 'doctor' }: Props) {
  const [role, setRole] = useState<StaffRole>(defaultRole);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) setRole(defaultRole);
  }, [open, defaultRole]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!fullName || !email || !phone) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          email,
          role,
          fullName,
          phone: phone.replace(/[\s()-]/g, ''),
          department: department || undefined,
          specialty: role === 'doctor' ? (specialty || undefined) : undefined,
        }),
      });
      setSuccess(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create account. Please try again.');
    }
    setLoading(false);
  };

  const handleClose = () => {
    if (loading) return;
    setFullName('');
    setEmail('');
    setPhone('');
    setDepartment('');
    setSpecialty('');
    setError('');
    setSuccess(false);
    setLoading(false);
    onClose();
  };

  return (
    <div className="admin-modal-overlay" onClick={handleClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        {success ? (
          <div className="admin-modal-success">
            <span className="admin-modal-success-icon"><Check size={36} /></span>
            <h2>Invitation Sent</h2>
            <p>
              An invitation for the {role === 'doctor' ? 'doctor' : 'receptionist'} account was sent to <strong>{email}</strong>.
              They will set their own password and enter a verification code sent to their email at sign-in.
            </p>
            <button className="admin-btn-primary" onClick={handleClose}>
              <Check size={18} /> Done
            </button>
          </div>
        ) : (
          <>
            <div className="admin-modal-header">
              <h2><UserPlus size={22} /> Register {role === 'doctor' ? 'Doctor' : 'Receptionist'}</h2>
              <button className="admin-modal-close" onClick={handleClose} disabled={loading} aria-label="Close registration"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="admin-modal-form">
              <div className="admin-form-group">
                <label className="admin-form-label">Account Type</label>
                <div className="admin-role-toggle">
                  <button
                    type="button"
                    className={role === 'doctor' ? 'active' : ''}
                    onClick={() => setRole('doctor')}
                  >
                    <Stethoscope size={18} /> Doctor
                  </button>
                  <button
                    type="button"
                    className={role === 'receptionist' ? 'active' : ''}
                    onClick={() => setRole('receptionist')}
                  >
                    <UsersRound size={18} /> Receptionist
                  </button>
                </div>
              </div>

              <div className="admin-form-row">
                <label className="admin-form-group">
                  <span className="admin-form-label">Full Name *</span>
                  <span className="admin-form-control">
                    <ShieldCheck size={16} />
                    <input required minLength={2} maxLength={160} value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </span>
                </label>
                <label className="admin-form-group">
                  <span className="admin-form-label">Email Address *</span>
                  <span className="admin-form-control">
                    <Mail size={16} />
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </span>
                </label>
              </div>

              <div className="admin-form-row">
                <label className="admin-form-group">
                  <span className="admin-form-label">Phone in international format *</span>
                  <span className="admin-form-control">
                    <Phone size={16} />
                    <input type="tel" required pattern="\+[1-9][0-9]{7,14}" title="Use international format, beginning with + and a country code." value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </span>
                </label>
              </div>

              <div className="admin-form-row">
                <label className="admin-form-group">
                  <span className="admin-form-label">Department</span>
                  <span className="admin-form-control">
                    <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                      <option value="">Select department</option>
                      {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </span>
                </label>
                {role === 'doctor' && (
                  <label className="admin-form-group">
                    <span className="admin-form-label">Specialty</span>
                    <span className="admin-form-control">
                        <select required value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
                        <option value="">Select specialty</option>
                        {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </span>
                  </label>
                )}
              </div>

              <div className="admin-modal-note">
                <ShieldCheck size={15} />
                <span>Email verification is required before the user can access clinic records.</span>
              </div>

              {error && <div className="admin-modal-error">{error}</div>}

              <div className="admin-modal-actions">
                <button type="button" className="admin-btn-secondary" disabled={loading} onClick={handleClose}>Cancel</button>
                <button type="submit" className="admin-btn-primary" disabled={loading}>
                  {loading ? <><Loader2 size={18} className="spin" /> Sending...</> : <><UserPlus size={18} /> Send Invitation</>}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
