import { Eye, EyeOff } from 'lucide-react';

type PasswordToggleProps = {
  inputId: string;
  fieldName: string;
  visible: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

export default function PasswordToggle({ inputId, fieldName, visible, onToggle, disabled = false }: PasswordToggleProps) {
  return <button
    type="button"
    className="password-toggle"
    onClick={onToggle}
    disabled={disabled}
    aria-label={`${visible ? 'Hide' : 'Show'} ${fieldName}`}
    aria-pressed={visible}
    aria-controls={inputId}
  >
    {visible ? <EyeOff size={18} strokeWidth={1.6} aria-hidden="true" /> : <Eye size={18} strokeWidth={1.6} aria-hidden="true" />}
  </button>;
}
