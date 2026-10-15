import { sendOtpEmail, type EmailSettings, type EmailTransport } from '../src/email.js';

// Transport-only regressions use an explicit synthetic administrator binding.
// Production dispatch authorization is tested separately without this helper.
export function sendOwnerFixture(email: string, code: string, challenge: string, settings: EmailSettings,
  validity?: number, transport: Partial<EmailTransport> = {}) {
  const userId = '00000000-0000-4000-8000-000000000091';
  return sendOtpEmail(email, code, challenge, {
    ...settings, RESEND_ADMIN_OWNER_EMAIL: email, RESEND_ADMIN_OWNER_USER_ID: userId,
  }, validity, transport, { userId, role: 'admin', email, senderFrom: settings.RESEND_FROM_EMAIL });
}
