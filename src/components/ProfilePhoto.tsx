import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Maximize2, Minimize2, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { apiRequest } from '../lib/api';
import { prepareProfileImage, validateProfileImage } from '../lib/profile-image';
import Modal from './Modal';
import './ProfilePhoto.css';

export default function ProfilePhoto({ className = '' }: { className?: string }) {
  const { profile, refreshProfile } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [operation, setOperation] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const busy = operation !== null;
  useEffect(() => {
    const controller = new AbortController();
    if (!profile?.avatar_path) { setUrl(null); return () => controller.abort(); }
    const load = () => apiRequest<{ data: { url: string | null } }>('/api/profile/photo', { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setUrl(result.data.url); }).catch(() => undefined);
    void load();
    const timer = window.setInterval(() => void load(), 12 * 60 * 1000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [profile?.id, profile?.avatar_path]);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const objectUrl = URL.createObjectURL(file); setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  const initials = (profile?.full_name || profile?.email || 'User').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const display = preview || url;
  function close() { setOpen(false); setFile(null); setExpanded(false); }
  function clearSelection() { setFile(null); if (input.current) input.current.value = ''; setExpanded(false); }
  async function upload() {
    if (!file || busy) return;
    setOperation('upload'); setError(''); setNotice('');
    try {
      const body = await prepareProfileImage(file);
      const result = await apiRequest<{ data: { url: string | null }; message?: string }>('/api/profile/photo', { method: 'PUT', headers: { 'Content-Type': body.type }, body });
      setUrl(result.data.url); clearSelection(); setNotice(result.message || 'Profile photo saved.');
      await refreshProfile();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to upload your photo. Retry shortly.'); }
    finally { setOperation(null); }
  }
  async function remove() {
    if (busy) return;
    setError(''); setNotice('');
    if (file) { clearSelection(); setNotice('Selected image removed.'); return; }
    if (!url && !profile?.avatar_path) return;
    setOperation('remove');
    try {
      await apiRequest('/api/profile/photo', { method: 'DELETE' });
      setUrl(null); clearSelection(); setNotice('Profile photo removed.');
      await refreshProfile();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to remove your image. Retry shortly.'); }
    finally { setOperation(null); }
  }
  return <><button type="button" className={`profile-photo-button ${className}`} aria-label="Edit profile photo" title="Edit profile photo"
    onClick={() => { setOpen(true); clearSelection(); setError(''); setNotice(''); }}>
    {url ? <img src={url} alt="Your profile" onError={() => setUrl(null)} /> : initials}
  </button>{open && <Modal title="Profile photo" onClose={close} busy={busy}>
    <div className="profile-photo-editor">
      <div className={`profile-photo-stage ${expanded ? 'profile-photo-stage-large' : ''}`}>
        {display ? <img className={`profile-photo-preview ${expanded ? 'profile-photo-preview-large' : ''}`} src={display} alt={file ? 'Selected profile image' : 'Your current profile'} /> : <Camera size={64} aria-hidden="true" />}
      </div>
      <p>JPEG, PNG or WebP · Up to 5 MB · Maximum 16 megapixels</p>
      {file && <p className="profile-photo-selection">{file.name} · Selected image is ready to upload.</p>}
      <input ref={input} className="profile-photo-file-input" tabIndex={-1} aria-label="Choose profile photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => {
        setError(''); setNotice(''); const selected = event.target.files?.[0];
        if (!selected) return;
        try { validateProfileImage(selected); setFile(selected); setExpanded(false); }
        catch (failure) { event.target.value = ''; setError(failure instanceof Error ? failure.message : 'Choose a valid image up to 5 MB.'); }
      }} />
      {error && <p role="alert" className="clinic-ops-error">{error}</p>}{notice && <p role="status" className="clinic-ops-success">{notice}</p>}
      <div className="profile-photo-actions">
        <button type="button" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={18} />Select image</button>
        <button className="primary" type="button" disabled={!file || busy} onClick={() => void upload()}><Upload size={18} />{operation === 'upload' ? 'Uploading image…' : 'Upload image'}</button>
        <button className="danger" type="button" disabled={busy || (!file && !url && !profile?.avatar_path)} onClick={() => void remove()}><Trash2 size={18} />{operation === 'remove' ? 'Removing image…' : 'Remove image'}</button>
        <button type="button" disabled={busy || !display} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}{expanded ? 'View smaller' : 'View larger'}</button>
      </div>
    </div>
  </Modal>}</>;
}
