import { config } from './config.js';
import { normalizeEmailAddress, productionEmailSender, senderEmailAddress } from './email-address.js';

export type EmailSettings = Pick<typeof config, 'NODE_ENV' | 'RESEND_API_KEY' | 'RESEND_FROM_EMAIL'>;
export class EmailDeliveryError extends Error {
  constructor(public readonly reason: 'configuration' | 'invalid_email' | 'timeout' | 'network' | 'authentication' | 'provider_rejected' | 'invalid_response', public readonly statusCode?: number) {
    super(`Email request failed: ${reason}`);
    this.name = 'EmailDeliveryError';
  }
}

export async function sendOtpEmail(email: string, code: string, challengeId: string, settings: EmailSettings = config) {
  const destination = normalizeEmailAddress(email);
  if (!destination) throw new EmailDeliveryError('invalid_email');
  const sender = senderEmailAddress(settings.RESEND_FROM_EMAIL);
  if (!/^re_[A-Za-z0-9_-]{20,}$/.test(settings.RESEND_API_KEY) || !sender || !/^\d{6}$/.test(code) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(challengeId)) {
    throw new EmailDeliveryError('configuration');
  }
  if (settings.NODE_ENV === 'production' && !productionEmailSender(settings.RESEND_FROM_EMAIL)) throw new EmailDeliveryError('configuration');

  let response: Response;
  let payload: unknown;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `otp/${challengeId}`,
      },
      body: JSON.stringify({
        from: settings.RESEND_FROM_EMAIL,
        to: [destination],
        subject: 'Your SCCPMS sign-in verification code',
        text: `Your SCCPMS verification code is ${code}. It expires in five minutes. Do not share this code. If you did not request it, ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:24px auto;color:#16324f"><h1 style="font-size:24px">Verify your SCCPMS sign-in</h1><p>Enter this code in the clinic sign-in screen:</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px;background:#eef4f8;padding:18px;text-align:center">${code}</p><p>This code expires in five minutes and can be used once.</p><p>Do not share this code. If you did not request it, ignore this email.</p></div>`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    payload = await response.json().catch(() => null);
  } catch (error) {
    const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    throw new EmailDeliveryError(timeout ? 'timeout' : 'network');
  }
  if (response.status === 401) throw new EmailDeliveryError('authentication', response.status);
  if (!response.ok) throw new EmailDeliveryError('provider_rejected', response.status);
  const messageId = (payload as { id?: unknown } | null)?.id;
  if (typeof messageId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(messageId)) throw new EmailDeliveryError('invalid_response');
  // Provider acceptance is recorded; entering the correct code proves inbox access.
  return { messageId, deliveryMode: 'email' as const };
}
