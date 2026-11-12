import {
  Prisma,
  SavedTender,
  Source,
  SourcePublication,
  Tender,
  TenderDocument,
  TenderMatch,
} from '@prisma/client';
import { z } from 'zod';
import { toYmd } from '../common/dates';
import type { MatchReason } from '../matching/matching.engine';

const reasonsSchema = z.array(
  z.object({ code: z.string(), label: z.string(), points: z.number() }),
);

export function parseReasons(value: Prisma.JsonValue): MatchReason[] {
  const res = reasonsSchema.safeParse(value);
  return res.success ? (res.data as MatchReason[]) : [];
}

export const NEW_MATCH_WINDOW_MS = 48 * 3600 * 1000;

export type TenderWithSource = Tender & {
  source: Pick<Source, 'code' | 'name'>;
};

export function toTenderListItem(
  t: TenderWithSource,
  match: TenderMatch | null | undefined,
  saved: SavedTender | null | undefined,
  now = new Date(),
) {
  return {
    id: t.id,
    title: t.title,
    reference: t.reference,
    organization: t.organization,
    categories: t.categories,
    sectors: t.sectors,
    procedureType: t.procedureType,
    location: t.location,
    publicationDate: toYmd(t.publicationDate),
    submissionDeadline: t.submissionDeadline,
    deadlineHasTime: t.deadlineHasTime,
    estimatedBudget:
      t.estimatedBudget === null ? null : Number(t.estimatedBudget),
    budgetTaxBasis: t.budgetTaxBasis,
    summary: t.summary,
    status: t.status,
    missingOrUncertainFields: t.missingOrUncertainFields,
    source: { code: t.source.code, name: t.source.name },
    sourceUrl: t.sourceUrl,
    sourcePages: t.sourcePages,
    match: match
      ? {
          score: match.score,
          reasons: parseReasons(match.reasons),
          matchedKeywords: match.matchedKeywords,
        }
      : null,
    saved: saved
      ? { isFavorite: saved.isFavorite, status: saved.status }
      : null,
    isNew: match
      ? now.getTime() - match.createdAt.getTime() < NEW_MATCH_WINDOW_MS
      : false,
  };
}

export type TenderListItem = ReturnType<typeof toTenderListItem>;

export function toTenderDetail(
  t: TenderWithSource & {
    documents: TenderDocument[];
    publication: SourcePublication | null;
  },
  match: TenderMatch | null,
  saved: SavedTender | null,
) {
  return {
    ...toTenderListItem(t, match, saved),
    description: t.description,
    fundingSource: t.fundingSource,
    eligibilityRequirements: t.eligibilityRequirements,
    requiredDocuments: t.requiredDocuments,
    documents: t.documents.map((d) => ({ label: d.label, url: d.url })),
    evidence: t.evidence,
    collectedAt: t.collectedAt,
    lastVerifiedAt: t.lastVerifiedAt,
    extractionModel: t.extractionModel,
    publication: t.publication
      ? {
          externalRef: t.publication.externalRef,
          publicationDate: toYmd(t.publication.publicationDate),
          fileUrl: t.publication.fileUrl,
          pageUrl: t.publication.pageUrl,
        }
      : null,
    note: saved?.note ?? null,
  };
}
