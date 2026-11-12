import { z } from 'zod';
import { pageQuery, queryBool, ymdSchemaRegex } from '../common/schemas';

const ymd = z
  .string()
  .regex(ymdSchemaRegex, 'Date attendue au format AAAA-MM-JJ');
const text = z.string().trim().min(1).max(200);

export const listTendersSchema = z.object({
  q: text.optional(),
  sector: text.optional(),
  organization: text.optional(),
  region: text.optional(),
  procedureType: text.optional(),
  from: ymd.optional(),
  to: ymd.optional(),
  deadlineFrom: ymd.optional(),
  deadlineTo: ymd.optional(),
  onlyMatched: queryBool.default('true'),
  favorite: queryBool.optional(),
  savedStatus: z
    .enum(['TO_REVIEW', 'INTERESTED', 'APPLYING', 'IGNORED'])
    .optional(),
  includeClosed: queryBool.default('false'),
  sort: z.enum(['relevance', 'deadline', 'recent']).default('relevance'),
  ...pageQuery,
});
export type ListTendersQuery = z.infer<typeof listTendersSchema>;

export const favoriteSchema = z.object({ isFavorite: z.boolean() }).strict();

export const statusSchema = z
  .object({
    status: z.enum(['TO_REVIEW', 'INTERESTED', 'APPLYING', 'IGNORED']),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type StatusInput = z.infer<typeof statusSchema>;
