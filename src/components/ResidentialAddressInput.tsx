import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { LoaderCircle, MapPin, Search } from 'lucide-react';
import './ResidentialAddressInput.css';

export type AddressSuggestion = { id: string; address: string; latitude: number | null; longitude: number | null; source: 'photon' | 'spu' | 'clinic' };
export type ResidentialAddressValue = { text: string; selection: AddressSuggestion | null };

function validSuggestion(value: unknown): value is AddressSuggestion {
  if (!value || typeof value !== 'object') return false;
  const item = value as AddressSuggestion;
  if (typeof item.id !== 'string' || item.id.length > 160 || typeof item.address !== 'string' || !item.address.trim() || item.address.length > 200) return false;
  if (item.source === 'spu' || item.source === 'clinic') return item.latitude === null && item.longitude === null;
  return item.source === 'photon' && typeof item.latitude === 'number' && Number.isFinite(item.latitude) && item.latitude >= -28.84 && item.latitude <= -28.60
    && typeof item.longitude === 'number' && Number.isFinite(item.longitude) && item.longitude >= 24.65 && item.longitude <= 24.89;
}

export default function ResidentialAddressInput({ id, value, onChange, required, disabled }: {
  id: string; value: ResidentialAddressValue; onChange: (value: ResidentialAddressValue) => void;
  required?: boolean; disabled?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [active, setActive] = useState(-1);
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const version = useRef(0);
  const listId = `${id}-suggestions`;
  const helpId = `${id}-help`;
  const open = focused && suggestions.length > 0;

  useEffect(() => {
    const current = ++version.current;
    const controller = new AbortController();
    setSuggestions([]); setActive(-1); setNotice(''); setLoading(false); setFailed(false);
    if (!focused || disabled || value.selection || value.text.trim().length < 3) return () => controller.abort();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      let timedOut = false;
      const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) throw new Error('Address search is unavailable.');
        const response = await fetch(`${apiUrl.replace(/\/$/, '')}/registration/addresses?q=${encodeURIComponent(value.text.trim())}`, {
          headers: { Accept: 'application/json' }, signal: controller.signal,
        });
        if (!response.ok) throw new Error('Address search is unavailable.');
        const body = await response.json() as { data?: AddressSuggestion[]; warning?: string };
        if (!Array.isArray(body.data) || !body.data.every(validSuggestion)) throw new Error('Address search is unavailable.');
        if (current !== version.current) return;
        setSuggestions(body.data);
        if (typeof body.warning === 'string') setNotice(body.warning.slice(0, 200));
        if (!body.data.length) setNotice('No matching map address found. Keep your manually entered residential address.');
      } catch {
        if ((!controller.signal.aborted || timedOut) && current === version.current) {
          setNotice('Address search is temporarily unavailable. You can enter your residential address manually.'); setFailed(true);
        }
      } finally { window.clearTimeout(timeout); if (current === version.current) setLoading(false); }
    }, 700);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value.text, value.selection, focused, disabled, retry]);

  function choose(suggestion: AddressSuggestion) {
    ++version.current;
    onChange({ text: suggestion.address, selection: suggestion });
    setSuggestions([]); setActive(-1); setNotice(''); setLoading(false);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { setFocused(false); setActive(-1); return; }
    if (!open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(previous => event.key === 'ArrowDown' ? (previous + 1) % suggestions.length : (previous <= 0 ? suggestions.length : previous) - 1);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault(); choose(suggestions[active]);
    }
  }

  return <div className="residential-search" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  }}>
    <span className="field-control">
      <Search size={17} aria-hidden="true" />
      <input id={id} name="addressLine1" role="combobox" value={value.text} required={required} disabled={disabled}
        maxLength={200} autoComplete="off" placeholder="Search your accommodation, residence or street"
        aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-describedby={helpId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => setFocused(true)} onKeyDown={keyDown}
        onChange={event => { ++version.current; onChange({ text: event.target.value, selection: null }); setFocused(true); }} />
      {loading && <LoaderCircle className="residential-loading" size={17} aria-hidden="true" />}
    </span>
    {open && <ul id={listId} className="residential-suggestions" role="listbox" aria-label="Kimberley address suggestions">
      {suggestions.map((suggestion, index) => <li key={suggestion.id} role="presentation">
        <button type="button" role="option" id={`${listId}-${index}`} aria-selected={active === index} tabIndex={-1}
          onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(suggestion)}>
          <MapPin size={16} aria-hidden="true" /><span>{suggestion.address}{suggestion.source !== 'photon' && <small>{suggestion.source === 'spu' ? 'SPU housing list' : 'Clinic accommodation list'} · exact map location unavailable</small>}</span>
        </button>
      </li>)}
    </ul>}
    <p id={helpId} className="residential-help">Enter where you currently stay in Kimberley. Private accommodation and manual addresses are accepted.</p>
    <p className="residential-status" role="status" aria-live="polite">{loading ? 'Searching Kimberley addresses…' : notice}</p>
    {failed && <button type="button" className="secondary-button" disabled={disabled} onClick={() => { setFocused(true); setRetry(value => value + 1); }}>Retry address search</button>}
    <div className="residential-attribution">
      {value.selection?.source === 'photon' && <a href={`https://www.openstreetmap.org/?mlat=${value.selection.latitude}&mlon=${value.selection.longitude}#map=17/${value.selection.latitude}/${value.selection.longitude}`} target="_blank" rel="noreferrer">View selected location</a>}
      {value.selection?.source === 'spu' && <a href="https://www.spu.ac.za/index.php/residences/" target="_blank" rel="noreferrer">SPU housing information</a>}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
  </div>;
}
