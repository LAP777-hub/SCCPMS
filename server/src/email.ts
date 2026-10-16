import { config } from './config.js';
import { normalizeEmailAddress, productionEmailSender, senderEmailAddress } from './email-address.js';

export type EmailSettings = Pick<typeof config, 'NODE_ENV' | 'RESEND_API_KEY' | 'RESEND_FROM_EMAIL'>
  & Partial<Pick<typeof config, 'OTP_VALIDITY_SECONDS' | 'RESEND_ADMIN_OWNER_EMAIL' | 'RESEND_ADMIN_OWNER_USER_ID' | 'BREVO_API_KEY' | 'BREVO_FROM_EMAIL'>>;
export type OtpEmailAuthorization = {
  userId: string;
  role: string;
  email: string;
  senderFrom?: string | null;
  provider?: 'resend' | 'brevo';
};
export const OWNER_OTP_SENDER = 'SCCPMS <onboarding@resend.dev>';

function authorizedOwner(context: Omit<OtpEmailAuthorization, 'senderFrom'> | undefined, settings: EmailSettings): boolean {
  const ownerEmail = normalizeEmailAddress(settings.RESEND_ADMIN_OWNER_EMAIL);
  const ownerId = settings.RESEND_ADMIN_OWNER_USER_ID;
  return Boolean(context && ownerEmail && typeof ownerId === 'string'
    && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ownerId)
    && context.role === 'admin' && context.userId === ownerId
    && normalizeEmailAddress(context.email) === ownerEmail);
}

// The server supplies this identity after JWT/profile validation. An empty or
// partial owner configuration cannot enable the provider's owner-only sender.
export function selectOtpEmailDelivery(context: Omit<OtpEmailAuthorization, 'senderFrom' | 'provider'>, settings: EmailSettings = config): { provider: 'resend' | 'brevo'; senderFrom: string } {
  if (authorizedOwner(context, settings)) return { provider: 'resend', senderFrom: OWNER_OTP_SENDER };
  if (context && ['patient', 'student', 'lecturer', 'staff', 'doctor', 'receptionist'].includes(context.role)
    && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(context.userId) && normalizeEmailAddress(context.email)) {
    return { provider: 'brevo', senderFrom: settings.BREVO_FROM_EMAIL ?? '' };
  }
  throw new EmailDeliveryError('configuration');
}

export function selectOtpEmailSender(context: Omit<OtpEmailAuthorization, 'senderFrom'>, settings: EmailSettings = config): string {
  try { return selectOtpEmailDelivery(context, settings).senderFrom; }
  catch { return ''; }
}

export function otpEmailDeliveryReady(context: Omit<OtpEmailAuthorization, 'senderFrom' | 'provider'>, settings: EmailSettings = config): boolean {
  try {
    const selection = selectOtpEmailDelivery(context, settings);
    return selection.provider === 'resend' ? /^re_[A-Za-z0-9_-]{20,}$/.test(settings.RESEND_API_KEY)
      : /^xkeysib-[A-Za-z0-9_-]{32,}$/.test(settings.BREVO_API_KEY ?? '') && productionEmailSender(selection.senderFrom);
  } catch { return false; }
}
type EmailFailureReason = 'configuration' | 'invalid_email' | 'timeout' | 'network' | 'authentication'
  | 'provider_rejected' | 'invalid_response' | 'sender_unverified' | 'rate_limited' | 'quota_exceeded' | 'ip_authorization' | 'duplicate_request';
export class EmailDeliveryError extends Error {
  readonly deliveryOutcome: 'not_sent' | 'unknown';
  constructor(public readonly reason: EmailFailureReason, public readonly statusCode?: number, public readonly retryAfterSeconds?: number) {
    super(`Email request failed: ${reason}`);
    this.name = 'EmailDeliveryError';
    this.deliveryOutcome = ['timeout', 'network', 'invalid_response', 'duplicate_request'].includes(reason)
      || (statusCode !== undefined && (statusCode >= 500 || statusCode === 409)) ? 'unknown' : 'not_sent';
  }
}

export type EmailTransport = {
  fetcher: typeof fetch;
  now: () => number;
  wait: (milliseconds: number) => Promise<void>;
  timeoutMs: number;
  attemptTimeoutMs: number;
};

function retrySeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  const seconds = Number.isFinite(numeric) ? numeric : (Date.parse(value) - Date.now()) / 1000;
  return Number.isFinite(seconds) ? Math.min(3600, Math.max(1, Math.ceil(seconds))) : undefined;
}

function rejectedEmail(response: Response, payload: unknown, provider: 'resend' | 'brevo'): EmailDeliveryError {
  const error = payload as { name?: unknown; message?: unknown; code?: unknown } | null;
  const name = typeof error?.name === 'string' ? error.name : typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message.slice(0, 2000) : '';
  if (provider === 'brevo') {
    if ([401, 403].includes(response.status) && /unrecogni[sz]ed IP|unrecognised IP|unauthori[sz]ed IP|IP address/i.test(message)) return new EmailDeliveryError('ip_authorization', response.status);
    if (name === 'duplicate_parameter') return new EmailDeliveryError('duplicate_request', response.status);
    if (['not_enough_credits', 'insufficient_credits', 'daily_quota_exceeded'].includes(name)) return new EmailDeliveryError('quota_exceeded', response.status);
    if (/sender/i.test(message) && /not valid|not verified|unverified|not activ|not authori[sz]ed/i.test(message)) return new EmailDeliveryError('sender_unverified', response.status);
  }
  if (response.status === 401) return new EmailDeliveryError('authentication', 401);
  if (response.status === 403 && name === 'validation_error' && typeof error?.message === 'string'
    && /domain.{0,200}not verified|only send testing emails/i.test(error.message)) {
    return new EmailDeliveryError('sender_unverified', 403);
  }
  if (response.status === 429 && ['daily_quota_exceeded', 'monthly_quota_exceeded'].includes(name)) {
    return new EmailDeliveryError('quota_exceeded', 429);
  }
  if (response.status === 429) return new EmailDeliveryError('rate_limited', 429, retrySeconds(response.headers.get('retry-after')) ?? 1);
  return new EmailDeliveryError('provider_rejected', response.status);
}

export async function sendOtpEmail(email: string, code: string, challengeId: string, settings: EmailSettings = config,
  validitySeconds = settings.OTP_VALIDITY_SECONDS ?? config.OTP_VALIDITY_SECONDS, transport: Partial<EmailTransport> = {},
  authorization?: OtpEmailAuthorization) {
  const destination = normalizeEmailAddress(email);
  if (!destination) throw new EmailDeliveryError('invalid_email');
  if (!authorization || destination !== normalizeEmailAddress(authorization.email)) throw new EmailDeliveryError('configuration');
  const selection = selectOtpEmailDelivery(authorization, settings);
  if (authorization.provider && authorization.provider !== selection.provider) throw new EmailDeliveryError('configuration');
  const selectedFrom = authorization.senderFrom ?? selection.senderFrom;
  const sender = senderEmailAddress(selectedFrom);
  if (!sender || !/^\d{6}$/.test(code)
    || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(challengeId)
    || !Number.isInteger(validitySeconds) || validitySeconds < 120 || validitySeconds > 900) {
    throw new EmailDeliveryError('configuration');
  }
  if (selection.provider === 'resend') {
    if (selectedFrom !== OWNER_OTP_SENDER || !/^re_[A-Za-z0-9_-]{20,}$/.test(settings.RESEND_API_KEY)) throw new EmailDeliveryError('configuration');
  } else if (!/^xkeysib-[A-Za-z0-9_-]{32,}$/.test(settings.BREVO_API_KEY ?? '') || !productionEmailSender(selectedFrom)
    || selectedFrom !== selection.senderFrom) {
    // Pending drafts from another provider/sender cannot be reinterpreted after
    // a deployment; their provider payload and idempotency identity are frozen.
    throw new EmailDeliveryError('configuration');
  }

  const fetcher = transport.fetcher ?? fetch;
  const now = transport.now ?? (() => performance.now());
  const wait = transport.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const budget = Math.min(10000, Math.max(1, transport.timeoutMs ?? 10000));
  const attemptTimeout = Math.min(budget, Math.max(1, transport.attemptTimeoutMs ?? 5500));
  const started = now();
  const duration = Number.isInteger(validitySeconds / 60) ? `${validitySeconds / 60} minutes` : `${validitySeconds} seconds`;
  // Reuse every field and the idempotency key on retry. Never queue a new code
  // just because the first response was lost after the provider accepted it.
  const content = {
        from: selectedFrom,
        to: [destination],
        subject: 'Your SCCPMS sign-in verification code',
        text: `Your SCCPMS verification code is ${code}. It expires in ${duration} after the email service accepts it. Do not share this code. If you did not request it, ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:24px auto;color:#16324f"><h1 style="font-size:24px">Verify your SCCPMS sign-in</h1><p>Enter this code in the clinic sign-in screen:</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px;background:#eef4f8;padding:18px;text-align:center">${code}</p><p>This code expires in ${duration} after the email service accepts it and can be used once.</p><p>Do not share this code. If you did not request it, ignore this email.</p></div>`,
  };
  const body = selection.provider === 'resend' ? JSON.stringify(content) : JSON.stringify({
    sender: { email: sender, name: 'SCCPMS' }, to: [{ email: destination }],
    subject: content.subject, htmlContent: content.html,
    headers: { idempotencyKey: challengeId }, tags: [`otp-${challengeId}`],
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = budget - (now() - started);
    if (remaining <= 0) throw new EmailDeliveryError('timeout');
    let failure: EmailDeliveryError;
    const controller = new AbortController();
    // Keep an explicit timer/controller alive through JSON body consumption.
    // A provider can send headers promptly and then stall its response body.
    let deadlineTimer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      deadlineTimer = setTimeout(() => {
        reject(new EmailDeliveryError('timeout'));
        controller.abort(new DOMException('Email request deadline reached.', 'TimeoutError'));
      }, Math.max(1, Math.floor(Math.min(attemptTimeout, remaining))));
    });
    try {
      const response = await Promise.race([fetcher(selection.provider === 'resend' ? 'https://api.resend.com/emails' : 'https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: selection.provider === 'resend'
          ? { Authorization: `Bearer ${settings.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `otp/${challengeId}` }
          : { 'api-key': settings.BREVO_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
        redirect: 'error',
        signal: controller.signal,
      }), deadline]);
      let payload: unknown;
      try { payload = await Promise.race([response.json(), deadline]); }
      catch (error) {
        if (error instanceof EmailDeliveryError || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))) throw error;
        payload = null;
      }
      if (!response.ok) throw rejectedEmail(response, payload, selection.provider);
      const messageId = selection.provider === 'resend' ? (payload as { id?: unknown } | null)?.id : (payload as { messageId?: unknown } | null)?.messageId;
      if (typeof messageId !== 'string' || (selection.provider === 'resend'
        ? !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(messageId)
        : !/^<[^\s<>@]{1,240}@[^\s<>@]{1,240}>$/.test(messageId))) throw new EmailDeliveryError('invalid_response');
      return { messageId, deliveryMode: 'email' as const, providerDurationMs: Math.max(0, Math.round(now() - started)) };
    } catch (error) {
      failure = error instanceof EmailDeliveryError ? error
        : new EmailDeliveryError(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'network');
    } finally { clearTimeout(deadlineTimer!); }
    const retryable = failure.reason !== 'duplicate_request' && (['timeout', 'network', 'invalid_response', 'rate_limited'].includes(failure.reason)
      || (failure.statusCode !== undefined && failure.statusCode >= 500)
      || (failure.statusCode === 409 && failure.deliveryOutcome === 'unknown'));
    const delay = (failure.retryAfterSeconds ?? 0.5) * 1000;
    if (attempt === 1 || !retryable || budget - (now() - started) <= delay + 100) throw failure;
    await wait(delay);
  }
  throw new EmailDeliveryError('timeout');
}
