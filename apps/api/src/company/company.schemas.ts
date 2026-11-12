import { z } from 'zod';
import { emailSchema } from '../common/schemas';
import { SECTOR_CODES } from '../reference/taxonomy';

const sectorCode = z
  .string()
  .refine((c) => SECTOR_CODES.includes(c), 'Secteur inconnu');
const shortList = z.array(z.string().trim().min(1).max(120)).max(50);
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === '' ? null : v));

export const updateCompanySchema = z
  .object({
    legalName: z.string().trim().min(2).max(200),
    tradeName: nullableText(200),
    description: nullableText(4000),
    mainSector: sectorCode.nullable(),
    secondarySectors: z.array(sectorCode).max(14),
    skills: shortList,
    services: shortList,
    city: nullableText(120),
    address: nullableText(300),
    regions: shortList,
    email: emailSchema.nullable().or(z.literal('').transform(() => null)),
    phone: nullableText(40),
    website: z
      .string()
      .trim()
      .url('Adresse de site invalide')
      .max(300)
      .nullable()
      .or(z.literal('').transform(() => null)),
  })
  .partial()
  .strict();
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const createMemberSchema = z
  .object({
    email: emailSchema,
    fullName: z.string().trim().min(2).max(120),
    role: z.enum(['COMPANY_ADMIN', 'COMPANY_MEMBER']).default('COMPANY_MEMBER'),
  })
  .strict();
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
