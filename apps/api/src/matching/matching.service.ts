import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Tender, WatchPreference } from '@prisma/client';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { bestMatch, MatchResult, PreferenceForMatch } from './matching.engine';

export const CLOSED_STATUSES = ['CLOSED', 'CANCELLED', 'AWARDED'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

type DeadlineFields = Pick<Tender, 'submissionDeadline' | 'deadlineHasTime'>;

/**
 * Instant de clôture effectif (D27) : une date limite sans heure écrite est stockée à
 * 00:00 UTC (= Ouagadougou) et reste valable toute la journée, donc jusqu'au lendemain 00:00.
 */
export function effectiveDeadline(t: DeadlineFields): Date | null {
  if (!t.submissionDeadline) return null;
  if (t.deadlineHasTime) return t.submissionDeadline;
  return new Date(t.submissionDeadline.getTime() + DAY_MS);
}

/** Annonce non clôturée : statut ouvert et date limite non dépassée (ou non précisée). */
export function openTenderWhere(now = new Date()): Prisma.TenderWhereInput {
  return {
    status: { notIn: [...CLOSED_STATUSES] },
    OR: [
      { submissionDeadline: null },
      { deadlineHasTime: true, submissionDeadline: { gte: now } },
      // Date seule : ouverte tant que date + 1 jour > now, soit date > now - 1 jour.
      {
        deadlineHasTime: false,
        submissionDeadline: { gt: new Date(now.getTime() - DAY_MS) },
      },
    ],
  };
}

export function isTenderOpen(
  t: Pick<Tender, 'status'> & DeadlineFields,
  now = new Date(),
): boolean {
  if ((CLOSED_STATUSES as readonly string[]).includes(t.status)) return false;
  const deadline = effectiveDeadline(t);
  if (!deadline) return true;
  return t.deadlineHasTime ? deadline >= now : deadline > now;
}

function toPref(p: WatchPreference): PreferenceForMatch {
  return {
    id: p.id,
    sectors: p.sectors,
    keywordsInclude: p.keywordsInclude,
    keywordsExclude: p.keywordsExclude,
    procedureTypes: p.procedureTypes,
    regions: p.regions,
    budgetMin: p.budgetMin,
    budgetMax: p.budgetMax,
    minScore: p.minScore,
  };
}

export interface MatchStats {
  tendersProcessed: number;
  matchesCreated: number;
  matchesUpdated: number;
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger('MatchingService');

  constructor(private readonly prisma: PrismaService) {}

  private async activePreferencesByCompany(
    companyId?: string,
  ): Promise<Map<string, PreferenceForMatch[]>> {
    const prefs = await this.prisma.watchPreference.findMany({
      where: {
        isActive: true,
        company: { status: 'ACTIVE' },
        ...(companyId ? { companyId } : {}),
      },
    });
    const byCompany = new Map<string, PreferenceForMatch[]>();
    for (const p of prefs) {
      const list = byCompany.get(p.companyId) ?? [];
      list.push(toPref(p));
      byCompany.set(p.companyId, list);
    }
    return byCompany;
  }

  /** Matche les annonces nouvelles ou modifiées depuis le dernier passage. */
  async matchAll(): Promise<MatchStats> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM tenders
      WHERE matched_at IS NULL OR matched_at < updated_at`;
    const stats: MatchStats = {
      tendersProcessed: 0,
      matchesCreated: 0,
      matchesUpdated: 0,
    };
    if (rows.length === 0) return stats;
    const ids = rows.map((r) => r.id);
    const tenders = await this.prisma.tender.findMany({
      where: { id: { in: ids } },
    });
    const prefs = await this.activePreferencesByCompany();
    const now = new Date();
    for (const tender of tenders) {
      if (isTenderOpen(tender, now)) {
        for (const [companyId, list] of prefs) {
          const res = bestMatch(tender, list);
          if (res)
            this.count(stats, await this.upsertBest(companyId, tender.id, res));
        }
      }
      stats.tendersProcessed += 1;
    }
    // SQL brut : ne touche pas updated_at (sinon l'annonce serait rematchée indéfiniment).
    await this.prisma.$executeRaw`
      UPDATE tenders SET matched_at = GREATEST(now(), updated_at)
      WHERE id = ANY(${ids}::uuid[])`;
    this.logger.log(
      `Matching : ${stats.tendersProcessed} annonce(s), ${stats.matchesCreated} nouveau(x) match(s), ${stats.matchesUpdated} mis à jour`,
    );
    return stats;
  }

  /** Recalcule les matches d'une entreprise sur toutes les annonces ouvertes (après changement de préférences). */
  async rematchCompany(companyId: string): Promise<MatchStats> {
    const stats: MatchStats = {
      tendersProcessed: 0,
      matchesCreated: 0,
      matchesUpdated: 0,
    };
    const prefs = (await this.activePreferencesByCompany(companyId)).get(
      companyId,
    );
    if (!prefs || prefs.length === 0) return stats;
    const tenders = await this.prisma.tender.findMany({
      where: openTenderWhere(),
    });
    for (const tender of tenders) {
      const res = bestMatch(tender, prefs);
      if (res)
        this.count(stats, await this.upsertBest(companyId, tender.id, res));
      stats.tendersProcessed += 1;
    }
    return stats;
  }

  private count(
    stats: MatchStats,
    outcome: 'created' | 'updated' | 'kept',
  ): void {
    if (outcome === 'created') stats.matchesCreated += 1;
    if (outcome === 'updated') stats.matchesUpdated += 1;
  }

  /** Upsert company×tender en gardant le meilleur score ; notified_at n'est jamais modifié. */
  private async upsertBest(
    companyId: string,
    tenderId: string,
    res: MatchResult,
  ): Promise<'created' | 'updated' | 'kept'> {
    const data = {
      preferenceId: res.preferenceId,
      score: res.score,
      reasons: res.reasons as unknown as Prisma.InputJsonValue,
      matchedKeywords: res.matchedKeywords,
    };
    const where = { companyId_tenderId: { companyId, tenderId } };
    const existing = await this.prisma.tenderMatch.findUnique({ where });
    if (!existing) {
      try {
        await this.prisma.tenderMatch.create({
          data: { companyId, tenderId, ...data },
        });
        return 'created';
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    const updated = await this.prisma.tenderMatch.updateMany({
      where: { companyId, tenderId, score: { lt: res.score } },
      data,
    });
    return updated.count > 0 ? 'updated' : 'kept';
  }
}
