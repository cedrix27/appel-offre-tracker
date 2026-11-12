import { z } from 'zod';
import { emailSchema, passwordSchema } from '../common/schemas';

export const registerSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const tokenSchema = z.object({ token: z.string().min(10).max(200) });

export const emailOnlySchema = z.object({ email: emailSchema });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const tokenPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password: passwordSchema,
});
