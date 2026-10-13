import { z } from 'zod';

const addressSchema = z.string().trim().toLowerCase().email().max(254);
export function normalizeEmailAddress(value: unknown): string | null {
  const result = addressSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function senderEmailAddress(value: string): string | null {
  if (/[\r\n]/.test(value) || value.length > 320) return null;
  const formatted = value.trim().match(/^[^<>]+<([^<>]+)>$/);
  return normalizeEmailAddress(formatted ? formatted[1] : value);
}

export function productionEmailSender(value: string): boolean {
  const sender = senderEmailAddress(value);
  if (!sender) return false;
  const domain = sender.split('@')[1];
  return domain !== 'resend.dev' && !domain.endsWith('.resend.dev')
    && domain !== 'localhost' && !/\.(invalid|example|test)$/.test(domain);
}

export function maskEmailAddress(value: string): string {
  const email = normalizeEmailAddress(value);
  if (!email) return 'your registered email';
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}
