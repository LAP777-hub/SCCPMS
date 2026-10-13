import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { getProgrammesForFaculty } from '../lib/academicCatalogue';
import './ProgrammeCombobox.css';

export type ProgrammeComboboxProps = {
  id: string;
  facultyCode: string;
  value: string;
  onChange: (programme: string) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  describedBy?: string;
};

/** Pair with a label whose htmlFor equals id. On faculty changes the parent
 * must clear its programme value alongside the faculty update. Only a catalogue
 * option can become the submitted value; search text is never submitted. */
export default function ProgrammeCombobox({
  id, facultyCode, value, onChange, name = 'program', required = false,
  disabled = false, describedBy,
}: ProgrammeComboboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const programmes = getProgrammesForFaculty(facultyCode);
  const selectedValue = programmes.includes(value) ? value : '';
  const unavailable = disabled || programmes.length === 0;
  const search = editing ? query.trim().toLocaleLowerCase('en-ZA') : '';
  const matches = programmes.filter((programme) => programme.toLocaleLowerCase('en-ZA').includes(search));
  const listId = `${id}-listbox`;
  const hintId = `${id}-hint`;
  const activeOption = open && matches[activeIndex] ? `${id}-option-${activeIndex}` : undefined;

  useEffect(() => {
    setOpen(false);
    setEditing(false);
    setQuery('');
    setActiveIndex(0);
  }, [facultyCode, disabled]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(
      !unavailable && !selectedValue && (required || (editing && query.trim()))
        ? 'Select a programme from the list for your faculty.' : '',
    );
  }, [selectedValue, required, unavailable, editing, query]);

  useEffect(() => {
    if (open && activeOption) document.getElementById(activeOption)?.scrollIntoView({ block: 'nearest' });
  }, [activeOption, open]);

  function choose(programme: string) {
    onChange(programme);
    setQuery('');
    setEditing(false);
    setOpen(false);
    inputRef.current?.setCustomValidity('');
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        if (!matches.length) return 0;
        if (!open) return event.key === 'ArrowDown' ? 0 : matches.length - 1;
        return event.key === 'ArrowDown'
          ? (current + 1) % matches.length
          : (current - 1 + matches.length) % matches.length;
      });
    } else if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : Math.max(matches.length - 1, 0));
    } else if (open && event.key === 'Enter') {
      event.preventDefault();
      if (matches[activeIndex]) choose(matches[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setEditing(false);
      setQuery('');
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div className="programme-combobox">
      <div className={`field-control programme-control${unavailable ? ' programme-control-disabled' : ''}`}>
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          type="text"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={open && !unavailable}
          aria-controls={listId}
          aria-activedescendant={activeOption}
          aria-describedby={[describedBy, hintId].filter(Boolean).join(' ')}
          required={required}
          disabled={unavailable}
          value={editing ? query : selectedValue}
          placeholder={programmes.length ? 'Search programmes' : 'Select a faculty first'}
          onFocus={() => {
            setOpen(true);
            setActiveIndex(Math.max(matches.indexOf(selectedValue), 0));
          }}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setEditing(true);
            setOpen(true);
            setActiveIndex(0);
            if (value) onChange('');
          }}
          onKeyDown={keyDown}
          onBlur={() => {
            setOpen(false);
            setEditing(false);
            setQuery('');
          }}
        />
        <ChevronDown className="programme-chevron" size={16} aria-hidden="true" />
      </div>
      <input type="hidden" name={name} value={selectedValue} disabled={disabled} />
      <span id={hintId} className="programme-sr-only">
        {unavailable ? 'Choose a faculty to see its programmes.' : 'Type to search. Use arrow keys to browse and Enter to select a programme.'}
      </span>
      {open && !unavailable && (
        <div className="programme-popup">
          <ul id={listId} role="listbox" aria-label="Programmes" className="programme-options">
            {matches.map((programme, index) => (
              <li
                key={programme}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={programme === selectedValue}
                className={index === activeIndex ? 'programme-option programme-option-active' : 'programme-option'}
                onMouseEnter={() => setActiveIndex(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(programme)}
              >
                {programme}
              </li>
            ))}
          </ul>
          <div className="programme-result-count" role="status" aria-live="polite">
            {matches.length ? `${matches.length} programme${matches.length === 1 ? '' : 's'} available` : 'No programmes match your search.'}
          </div>
        </div>
      )}
    </div>
  );
}
