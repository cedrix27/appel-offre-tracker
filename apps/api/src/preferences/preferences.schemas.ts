import { z } from 'zod';
import { emailSchema } from '../common/schemas';
import { PROCEDURE_TYPES, SECTOR_CODES } from '../reference/taxonomy';

const terms = z
  .array(z.string().trim().min(1).max(80))
  .max(50)
  .transform((list) => {
    const seen = new Set<string>();
    return list.filter((t) => {
      const k = t.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  });

const budget = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();

const base = z.object({
  name: z.string().trim().min(1).max(120),
  sectors: z
    .array(
      z.string().refine((c) => SECTOR_CODES.includes(c), 'Secteur inconnu'),
    )
    .max(14)
    .transform((l) => [...new Set(l)]),
  keywordsInclude: terms,
  keywordsExclude: terms,
  procedureTypes: z
    .array(
      z
        .string()
        .refine(
          (p) => PROCEDURE_TYPES.includes(p),
          'Type de procédure inconnu',
        ),
    )
    .transform((l) => [...new Set(l)]),
  regions: terms,
  budgetMin: budget,
  budgetMax: budget,
  minScore: z.number().int().min(0).max(100),
  recipients: z
    .array(emailSchema)
    .max(20)
    .transform((l) => [...new Set(l)]),
  isActive: z.boolean(),
});

const budgetOrder = (v: {
  budgetMin?: number | null;
  budgetMax?: number | null;
}) => v.budgetMin == null || v.budgetMax == null || v.budgetMin <= v.budgetMax;
const budgetMsg = {
  message: 'Le budget minimum doit être inférieur ou égal au budget maximum',
  path: ['budgetMin'],
};

export const createPreferenceSchema = base
  .extend({
    name: base.shape.name.default('Veille principale'),
    sectors: base.shape.sectors.default([]),
    keywordsInclude: terms.default([]),
    keywordsExclude: terms.default([]),
    procedureTypes: base.shape.procedureTypes.default([]),
    regions: terms.default([]),
    budgetMin: budget.optional().transform((v) => v ?? null),
    budgetMax: budget.optional().transform((v) => v ?? null),
    minScore: base.shape.minScore.default(40),
    recipients: base.shape.recipients.default([]),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine(budgetOrder, budgetMsg)
  .refine((v) => v.sectors.length > 0 || v.keywordsInclude.length > 0, {
    message: 'Choisissez au moins un secteur ou un mot-clé',
    path: ['sectors'],
  });
export type CreatePreferenceInput = z.infer<typeof createPreferenceSchema>;

export const updatePreferenceSchema = base
  .partial()
  .strict()
  .refine(budgetOrder, budgetMsg);
export type UpdatePreferenceInput = z.infer<typeof updatePreferenceSchema>;
