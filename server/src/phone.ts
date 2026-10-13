import { z } from 'zod';

const phoneError = 'Use one international phone number beginning with + or 00 and a country code, for example +27712345678.';

/** Normalize an explicitly international number without guessing its country. */
export function normalizePhoneNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (input.length > 64 || !/^(?:\+|00)[0-9 ()-]+$/.test(input)) return null;

  // Parentheses may group digits, but unmatched, empty or nested groups are not
  // telephone formatting and must not become a different number when removed.
  let open = false;
  let groupHasDigit = false;
  for (const character of input) {
    if (character === '(') {
      if (open) return null;
      open = true;
      groupHasDigit = false;
    } else if (character === ')') {
      if (!open || !groupHasDigit) return null;
      open = false;
    } else if (open && /[0-9]/.test(character)) {
      groupHasDigit = true;
    }
  }
  if (open) return null;

  const compact = input.replace(/[ ()-]/g, '');
  const normalized = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  return /^\+[1-9][0-9]{7,14}$/.test(normalized) ? normalized : null;
}

export const phoneSchema = z.string().transform((value, context) => {
  const phone = normalizePhoneNumber(value);
  if (!phone) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: phoneError });
    return z.NEVER;
  }
  return phone;
});
