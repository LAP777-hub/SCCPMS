import { config } from './config.js';

type SmsResponse = {
  SMSMessageData?: {
    Recipients?: Array<{ status?: string; statusCode?: number }>;
  };
};

export async function sendOtpSms(phone: string, code: string) {
  const form = new URLSearchParams({
    username: config.AFRICASTALKING_USERNAME,
    to: phone,
    message: `Your SCCPMS verification code is ${code}. It expires in 5 minutes. Do not share it.`,
  });
  if (config.AFRICASTALKING_SENDER_ID) form.set('from', config.AFRICASTALKING_SENDER_ID);

  const response = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: {
      apiKey: config.AFRICASTALKING_API_KEY,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  const payload = await response.json().catch(() => null) as SmsResponse | null;
  const recipient = payload?.SMSMessageData?.Recipients?.[0];
  if (!response.ok || !recipient || (recipient.statusCode !== 101 && recipient.status !== 'Success')) {
    throw new Error('SMS provider rejected the message');
  }
}