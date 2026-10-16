import { useEffect, useState } from 'react';
import { Camera, Upload } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { apiRequest } from '../lib/api';
import Modal from './Modal';
import './ProfilePhoto.css';

export default function ProfilePhoto({ className = '' }: { className?: string }) {
  const { profile, refreshProfile } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    if (!profile?.avatar_path) { setUrl(null); return () => controller.abort(); }
    const load = () => apiRequest<{ data: { url: string | null } }>('/api/profile/photo', { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setUrl(result.data.url); }).catch(() => undefined);
    void load();
    const timer = window.setInterval(() => void load(), 12 * 60 * 1000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [profile?.id, profile?.avatar_path]);
  const initials = (profile?.full_name || profile?.email || 'User').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  async function upload() {
    if (!file || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiRequest<{ data: { url: string | null }; message?: string }>('/api/profile/photo', { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      setUrl(result.data.url); setFile(null); setNotice(result.message || 'Profile photo saved.');
      await refreshProfile();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to upload your photo. Retry shortly.'); }
    finally { setBusy(false); }
  }
  return <><button type="button" className={`profile-photo-button ${className}`} aria-label="Edit profile photo" title="Edit profile photo"
    onClick={() => { setOpen(true); setFile(null); setError(''); setNotice(''); }}>
    {url ? <img src={url} alt="Your profile" onError={() => setUrl(null)} /> : initials}
  </button>{open && <Modal title="Profile photo" onClose={() => setOpen(false)} busy={busy}>
    <div className="profile-photo-editor">
      {url ? <img className="profile-photo-preview" src={url} alt="Your current profile" /> : <Camera size={48} aria-hidden="true" />}
      <p>Choose a JPEG, PNG or WebP image up to 2 MB and 16 megapixels. Your photo is stored privately.</p>
      <label>Choose profile photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => {
        setError(''); setNotice(''); const selected = event.target.files?.[0];
        if (!selected) { setFile(null); return; }
        if (!['image/jpeg','image/png','image/webp'].includes(selected.type) || !selected.size || selected.size > 2 * 1024 * 1024) { setFile(null); setError('Choose a JPEG, PNG or WebP photo up to 2 MB.'); return; }
        setFile(selected);
      }} /></label>
      {error && <p role="alert" className="clinic-ops-error">{error}</p>}{notice && <p role="status" className="clinic-ops-success">{notice}</p>}
      <button className="clinic-ops-button primary" type="button" disabled={!file || busy} onClick={() => void upload()}><Upload size={17} />{busy ? 'Uploading…' : 'Upload photo'}</button>
    </div>
  </Modal>}</>;
}
