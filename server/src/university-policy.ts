import { z } from 'zod';

export const accountEmailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

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
}
