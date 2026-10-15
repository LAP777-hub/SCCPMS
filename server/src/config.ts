import 'dotenv/config';
import { z } from 'zod';
import { productionEmailSender, senderEmailAddress } from './email-address.js';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  FRONTEND_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  DATABASE_EVENTS_URL: z.string().optional(),
  DATABASE_SSL_MODE: z.enum(['disable', 'verify-full']).optional(),
  DATABASE_SSL_CA: z.string().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OTP_HMAC_SECRET: z.string().min(32),
  OTP_VALIDITY_SECONDS: z.coerce.number().int().min(120).max(900).default(600),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(30).max(300).default(30),
  RESEND_API_KEY: z.string().trim().default(''),
  RESEND_FROM_EMAIL: z.string().trim().default(''),
  BREVO_API_KEY: z.string().trim().default(''),
  BREVO_FROM_EMAIL: z.string().trim().default(''),
  // Optional bootstrap delivery only to the confirmed Resend owner's admin.
  RESEND_ADMIN_OWNER_EMAIL: z.union([z.literal(''), z.string().trim().email().max(254).transform(value => value.toLowerCase())]).default(''),
  RESEND_ADMIN_OWNER_USER_ID: z.union([z.literal(''), z.string().uuid()]).default(''),
  // Photon permits search-as-you-type; its public demo is for modest traffic only.
  ADDRESS_PHOTON_URL: z.string().url().default('https://photon.komoot.io/api/'),
  ADDRESS_SEARCH_INTERVAL_MS: z.coerce.number().int().min(1000).default(1100),
  ADDRESS_SEARCH_DAILY_LIMIT: z.coerce.number().int().min(1).max(100000).default(500),
});

export const configSchema = schema.superRefine((value, context) => {
  if (Boolean(value.RESEND_ADMIN_OWNER_EMAIL) !== Boolean(value.RESEND_ADMIN_OWNER_USER_ID)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['RESEND_ADMIN_OWNER_USER_ID'], message: 'Owner-only admin delivery requires both the confirmed owner email and administrator Auth ID.' });
  }
  const addressProvider = new URL(value.ADDRESS_PHOTON_URL);
  if (!['http:', 'https:'].includes(addressProvider.protocol) || addressProvider.username || addressProvider.password || addressProvider.search || addressProvider.hash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ADDRESS_PHOTON_URL'], message: 'Use an HTTP(S) Photon search endpoint without credentials, a query or fragment.' });
  }
  const origin = new URL(value.FRONTEND_ORIGIN);
  if (!['http:', 'https:'].includes(origin.protocol) || value.FRONTEND_ORIGIN !== origin.origin) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['FRONTEND_ORIGIN'], message: 'Use an HTTP(S) origin without credentials, a path, query or trailing slash.' });
  }
  if (value.NODE_ENV === 'production' && origin.protocol !== 'https:') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['FRONTEND_ORIGIN'], message: 'Production requires an HTTPS frontend origin.' });
  }
  const sender = senderEmailAddress(value.RESEND_FROM_EMAIL);
  const ownerConfigured = Boolean(value.RESEND_ADMIN_OWNER_EMAIL && value.RESEND_ADMIN_OWNER_USER_ID);
  const brevoConfigured = /^xkeysib-[A-Za-z0-9_-]{32,}$/.test(value.BREVO_API_KEY) && productionEmailSender(value.BREVO_FROM_EMAIL);
  if (value.BREVO_API_KEY && !/^xkeysib-[A-Za-z0-9_-]{32,}$/.test(value.BREVO_API_KEY)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['BREVO_API_KEY'], message: 'Use a full Brevo API key, not its SMTP or encoded MCP credential.' });
  }
  if (value.BREVO_FROM_EMAIL && !productionEmailSender(value.BREVO_FROM_EMAIL)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['BREVO_FROM_EMAIL'], message: 'Use a valid Brevo sender email or Display Name <email@example.com>, without reserved domains or line breaks.' });
  }
  if (value.RESEND_FROM_EMAIL && !sender) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['RESEND_FROM_EMAIL'], message: 'Use a valid sender email or Display Name <email@example.com>, without line breaks.' });
  }
  if (value.NODE_ENV === 'production' && !ownerConfigured && !brevoConfigured) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['BREVO_FROM_EMAIL'], message: 'Configure Brevo delivery or the complete owner-only administrator binding while general email delivery is unavailable.' });
  }
  if (value.NODE_ENV === 'production' && ownerConfigured && !/^re_[A-Za-z0-9_-]{20,}$/.test(value.RESEND_API_KEY)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['RESEND_API_KEY'], message: 'Production requires a full Resend API key; a masked exported token cannot send email.' });
  }
  if (value.NODE_ENV === 'production' && sender && !productionEmailSender(value.RESEND_FROM_EMAIL)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['RESEND_FROM_EMAIL'], message: 'Production requires a sender on your verified Resend domain; development and reserved test domains cannot be used.' });
  }
  if (value.NODE_ENV === 'production' && value.DATABASE_SSL_MODE !== 'verify-full') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_SSL_MODE'],
      message: 'Production requires DATABASE_SSL_MODE=verify-full for the Supabase database.',
    });
  }
});
export const config = configSchema.parse(process.env);
