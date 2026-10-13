import { config } from './config.js';
import { normalizePhoneNumber } from './phone.js';

type SmsResponse = {
  SMSMessageData?: {
    Recipients?: Array<{ number?: string; status?: string; statusCode?: number; messageId?: string }>;
  };
};

// Retained for earlier integrations. Active login verification uses email.ts.
export type SmsSettings = { NODE_ENV: typeof config.NODE_ENV; AFRICASTALKING_USERNAME: string; AFRICASTALKING_API_KEY: string; AFRICASTALKING_SENDER_ID?: string };
const legacySettings: SmsSettings = {
  NODE_ENV: config.NODE_ENV,
  AFRICASTALKING_USERNAME: process.env.AFRICASTALKING_USERNAME || '',
  AFRICASTALKING_API_KEY: process.env.AFRICASTALKING_API_KEY || '',
  AFRICASTALKING_SENDER_ID: process.env.AFRICASTALKING_SENDER_ID,
};
export class SmsDeliveryError extends Error {
  constructor(public readonly reason: 'configuration' | 'invalid_number' | 'timeout' | 'network' | 'authentication' | 'provider_rejected' | 'invalid_response', public readonly statusCode?: number) {
    super(`SMS request failed: ${reason}`);
    this.name = 'SmsDeliveryError';
  }
}

export function smsApiOrigin(settings: SmsSettings = legacySettings) {
  if (settings.NODE_ENV === 'production' && settings.AFRICASTALKING_USERNAME === 'sandbox') {
    throw new SmsDeliveryError('configuration');
  }
  return settings.AFRICASTALKING_USERNAME === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
}

export async function sendOtpSms(phone: string, code: string, settings: SmsSettings = legacySettings) {
  const smsOrigin = smsApiOrigin(settings);
  const destination = normalizePhoneNumber(phone);
  if (!destination) throw new SmsDeliveryError('invalid_number');
  if (!/^\d{6}$/.test(code)) throw new SmsDeliveryError('configuration');
  const form = new URLSearchParams({
    username: settings.AFRICASTALKING_USERNAME,
    to: destination,
    bulkSMSMode: '1',
    message: `Your SCCPMS verification code is ${code}. It expires in 5 minutes. Do not share it.`,
  });
  if (settings.AFRICASTALKING_SENDER_ID) form.set('from', settings.AFRICASTALKING_SENDER_ID);

  let response: Response;
  let payload: SmsResponse | null;
  try {
  response = await fetch(`${smsOrigin}/version1/messaging`, {
    method: 'POST',
    headers: {
      apiKey: settings.AFRICASTALKING_API_KEY,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  payload = await response.json().catch(() => null) as SmsResponse | null;
  } catch (error) {
    const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    throw new SmsDeliveryError(timeout ? 'timeout' : 'network');
  }
  if ([401, 403].includes(response.status)) throw new SmsDeliveryError('authentication', response.status);
  if (!response.ok) throw new SmsDeliveryError('provider_rejected', response.status);
  const recipients = payload?.SMSMessageData?.Recipients;
  if (!Array.isArray(recipients) || recipients.length !== 1) throw new SmsDeliveryError('invalid_response');
  const recipient = recipients[0];
  if (normalizePhoneNumber(recipient.number) !== destination) throw new SmsDeliveryError('invalid_response');
  // 100/102 are processing/queued, 101 is submitted. None proves handset delivery.
  if (![100, 101, 102].includes(recipient.statusCode ?? 0)) throw new SmsDeliveryError('provider_rejected', recipient.statusCode);
  if (typeof recipient.messageId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(recipient.messageId)) throw new SmsDeliveryError('invalid_response');
  return { messageId: recipient.messageId, statusCode: recipient.statusCode!, deliveryMode: settings.AFRICASTALKING_USERNAME === 'sandbox' ? 'sandbox' : 'live' };
}
