import { z } from 'zod';
import { pageQuery, uuidRegex, ymdSchemaRegex } from '../common/schemas';

export const statusSchema = z
  .object({ status: z.enum(['ACTIVE', 'SUSPENDED']) })
  .strict();
export type StatusInput = z.infer<typeof statusSchema>;

const sourceFields = {
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{2,40}$/, 'Code : 2 à 40 caractères a-z, 0-9, - ou _'),
  name: z.string().trim().min(2).max(200),
  baseUrl: z.string().trim().url().max(500),
  type: z.string().trim().min(2).max(40),
  accessMethod: z.string().trim().min(2).max(1000),
  frequencyCron: z
    .string()
    .trim()
    .regex(/^(\S+\s+){4}\S+$/, 'Expression cron à 5 champs attendue'),
  status: z.enum(['ACTIVE', 'PAUSED', 'DISABLED']),
  notes: z.string().trim().max(2000).nullable(),
};

export const createSourceSchema = z
  .object({
    ...sourceFields,
    frequencyCron: sourceFields.frequencyCron.default('0 7 * * *'),
    status: sourceFields.status.default('ACTIVE'),
    notes: sourceFields.notes.optional(),
  })
  .strict();
export type CreateSourceInput = z.infer<typeof createSourceSchema>;

export const updateSourceSchema = z
  .object(sourceFields)
  .omit({ code: true })
  .partial()
  .strict();
export type UpdateSourceInput = z.infer<typeof updateSourceSchema>;

export const pageSchema = z.object(pageQuery);
export type PageInput = z.infer<typeof pageSchema>;

export const sourceRunsQuery = z.object({
  ...pageQuery,
  sourceId: z.string().regex(uuidRegex).optional(),
  outcome: z
    .enum(['RUNNING', 'SUCCESS_NEW', 'SUCCESS_NONE', 'FAILED'])
    .optional(),
});
export type SourceRunsQuery = z.infer<typeof sourceRunsQuery>;

export const adminTendersQuery = z.object({
  ...pageQuery,
  q: z.string().trim().min(1).max(200).optional(),
  sourceId: z.string().regex(uuidRegex).optional(),
});
export type AdminTendersQuery = z.infer<typeof adminTendersQuery>;

export const adminNotificationsQuery = z.object({
  ...pageQuery,
  status: z.enum(['QUEUED', 'SENT', 'FAILED', 'SKIPPED']).optional(),
  companyId: z.string().regex(uuidRegex).optional(),
});
export type AdminNotificationsQuery = z.infer<typeof adminNotificationsQuery>;

export const pipelineRunSchema = z
  .object({
    date: z
      .string()
      .regex(ymdSchemaRegex, 'Date attendue au format AAAA-MM-JJ')
      .optional(),
  })
  .strict();
