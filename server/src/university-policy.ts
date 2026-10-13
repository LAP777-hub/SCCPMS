import { z } from 'zod';

export const universityEmailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase())
  .refine((value) => {
    const domains = (process.env.UNIVERSITY_EMAIL_DOMAINS || 'spu.ac.za')
      .split(',')
      .map((domain) => domain.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean);
    return domains.includes(value.split('@')[1]);
  }, 'Use your official university email address (@spu.ac.za).');

export function refinePatientIdentity(
  value: {
    email: string;
    userType: string;
    studentNumber?: string | null;
    staffNumber?: string | null;
  },
  context: z.RefinementCtx
) {
  const field = value.userType === 'Student' ? 'studentNumber' : 'staffNumber';
  const number = value[field]?.trim();
  if (!number || !/^[a-z0-9-]{1,40}$/i.test(number)) {
    context.addIssue({
      code: 'custom',
      path: [field],
      message: 'Your valid university identity number is required.',
    });
  }
  if (
    value.userType === 'Student' &&
    number &&
    value.email.split('@')[0].toLowerCase() !== number.toLowerCase()
  ) {
    context.addIssue({
      code: 'custom',
      path: ['email'],
      message:
        'Use the university email associated with your student number (studentnumber@spu.ac.za).',
    });
  }
}
