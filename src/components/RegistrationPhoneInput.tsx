import { useId, useState } from 'react';
import { CALLING_CODE_COUNTRIES } from '../lib/countryCallingCodes';
import './RegistrationPhoneInput.css';

export default function RegistrationPhoneInput({ disabled = false }: { disabled?: boolean }) {
  const id = useId();
  const [region, setRegion] = useState('ZA');
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const country = CALLING_CODE_COUNTRIES.find(item => item.region === region)!;
  const digits = number.replace(/\D/g, '');
  const canonical = digits && !error ? `+${country.callingCode}${digits}` : '';
  function change(raw: string) {
    let value = raw.trim().replace(/[\s()-]/g, '');
    if (value.startsWith('00')) value = `+${value.slice(2)}`;
    if (!/^\+?\d*$/.test(value)) { setNumber(raw); setError('Use digits, spaces, parentheses or hyphens for your phone number.'); return; }
    if (value.startsWith('+')) {
      if (!value.startsWith(`+${country.callingCode}`)) { setNumber(raw); setError('Choose the matching country code before entering this international number.'); return; }
      value = value.slice(country.callingCode.length + 1);
    }
    setError('');
    if (country.trunkPrefix && value.startsWith(country.trunkPrefix)) value = value.slice(country.trunkPrefix.length);
    setNumber(value);
  }
  return <div className="field-group">
    <label className="field-label" htmlFor={`${id}-number`}>Phone (international format)</label>
    <div className="registration-phone">
      <span className="field-control"><select aria-label="Phone country code" value={region} disabled={disabled}
        onChange={event => { setRegion(event.target.value); setNumber(''); setError(''); }}>
        {CALLING_CODE_COUNTRIES.map(item => <option key={item.region} value={item.region}>{item.region} +{item.callingCode} — {item.name}</option>)}
      </select></span>
      <span className="field-control"><input id={`${id}-number`} type="tel" autoComplete="tel-national" inputMode="numeric"
        value={number} onChange={event => change(event.target.value)} required disabled={disabled}
        pattern={region === 'ZA' ? '[1-9][0-9]{8}' : `[0-9][0-9]{${Math.max(1, 7 - country.callingCode.length)},${14 - country.callingCode.length}}`}
        maxLength={40} placeholder={region === 'ZA' ? '812345678' : 'National number'} aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} aria-invalid={Boolean(error)}
        title={region === 'ZA' ? 'Enter nine digits after +27. Leave out the first 0 of your local number.' : 'Enter the national phone number without its country code.'} /></span>
    </div>
    <input type="hidden" name="phone" value={canonical} />
    <small id={`${id}-help`}>{region === 'ZA' ? 'Enter the 9 digits after +27, without the first 0.' : 'Enter your number without the country code.'}</small>
    {error && <small id={`${id}-error`} className="clinic-ops-error" role="alert">{error}</small>}
  </div>;
}
