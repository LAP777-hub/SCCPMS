import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL_MODE: z.enum(['disable', 'verify-full']).optional(),
  DATABASE_SSL_CA: z.string().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OTP_HMAC_SECRET: z.string().min(32),
  AFRICASTALKING_USERNAME: z.string().min(1),
  AFRICASTALKING_API_KEY: z.string().min(1),
  AFRICASTALKING_SENDER_ID: z.string().optional(),
});

export const config = schema.superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && !value.DATABASE_SSL_MODE) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_SSL_MODE'],
      message: 'Set DATABASE_SSL_MODE=verify-full or explicitly disable TLS for an approved private database network.',
    });
  }
}).parse(process.env);