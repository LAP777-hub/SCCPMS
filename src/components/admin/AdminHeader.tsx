import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, Menu, Search, X } from 'lucide-react';
import ProfilePhoto from '../ProfilePhoto';
import { RefreshButton, type ClinicPatient, type ClinicStaff } from './ClinicOperations';

export default function AdminHeader<T extends string>({ title, sidebarOpen, onToggleMenu, timezone, name, unread, patients, staff, pages, onNavigate, refresh }: {
  title: string; sidebarOpen: boolean; onToggleMenu: () => void; timezone: string; name: string; unread: number;
  patients: ClinicPatient[]; staff: ClinicStaff[]; pages: Array<{ id: T; label: string }>;
  onNavigate: (section: T, search?: string) => void; refresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const input = useRef<HTMLInputElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    const shortcut = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); setOpen(true); } if (event.key === 'Escape') setOpen(false); };
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('keydown', shortcut); document.addEventListener('pointerdown', outside);
    return () => { window.clearInterval(clock); window.removeEventListener('keydown', shortcut); document.removeEventListener('pointerdown', outside); };
  }, []);
  const term = query.trim().toLowerCase();
  const results = term.length < 2 ? [] : [
    ...pages.filter(page => page.label.toLowerCase().includes(term)).map(page => ({ key: page.id, label: page.label, category: 'Page', section: page.id, search: '' })),
    ...patients.filter(patient => `${patient.full_name || ''} ${patient.email} ${patient.student_number || ''}`.toLowerCase().includes(term)).slice(0, 4).map(patient => ({ key: patient.id, label: patient.full_name || patient.email, category: 'Patient', section: 'patients' as T, search: patient.email })),
    ...staff.filter(member => `${member.full_name || ''} ${member.email} ${member.role}`.toLowerCase().includes(term)).slice(0, 4).map(member => ({ key: member.id, label: member.full_name || member.email, category: member.role === 'doctor' ? 'Doctor' : 'Receptionist', section: 'staff' as T, search: member.email })),
  ].slice(0, 8);
  return <header className="admin-topbar admin-reference-topbar">
    <button className="admin-menu-btn" onClick={onToggleMenu} aria-label="Toggle menu" aria-expanded={sidebarOpen} aria-controls="admin-sidebar">{sidebarOpen ? <X size={22} /> : <Menu size={22} />}</button>
    <h2 className="ao-sr-only">{title}</h2>
    <div className="admin-clinic-search" ref={wrapper}><div><Search size={19} aria-hidden="true" /><input ref={input} aria-label="Search clinic" placeholder="Search patients, staff, pages…" value={query} onChange={event => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} aria-expanded={open && term.length >= 2} aria-controls="admin-search-results" autoComplete="off" /><kbd>Ctrl K</kbd></div>
      {open && term.length >= 2 && <div id="admin-search-results" className="admin-search-results" aria-label="Clinic search results">{results.map(result => <button key={`${result.category}-${result.key}`} onClick={() => { onNavigate(result.section, result.search); setQuery(''); setOpen(false); input.current?.blur(); }}><span>{result.label}</span><small>{result.category}</small></button>)}{!results.length && <p>No matching patients, staff or pages.</p>}</div>}
    </div>
    <time className="admin-header-clock" dateTime={now.toISOString()} title={timezone}><CalendarDays size={18} aria-hidden="true" /><span>{now.toLocaleDateString('en-ZA', { timeZone: timezone, month: 'short', day: 'numeric', year: 'numeric' })}</span><span>{now.toLocaleTimeString('en-ZA', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</span></time>
    <div className="admin-topbar-actions"><RefreshButton refresh={refresh} /><button className="admin-icon-btn" onClick={() => { const page = pages.find(page => page.id === 'notifications'); if (page) onNavigate(page.id); }} aria-label="Notifications"><Bell size={21} />{unread > 0 && <span className="admin-unread-count">{unread > 99 ? '99+' : unread}</span>}</button><div className="admin-user-chip"><ProfilePhoto className="admin-user-avatar" /><div><strong>{name}</strong><small>Administrator</small></div></div></div>
  </header>;
}
