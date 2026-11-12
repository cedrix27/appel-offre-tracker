import { Injectable } from '@nestjs/common';
import { toYmd } from '../common/dates';
import { openTenderWhere } from '../matching/matching.service';
import { PrismaService } from '../prisma/prisma.service';
import { TendersService } from '../tenders/tenders.service';

const DAY = 24 * 3600 * 1000;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenders: TendersService,
  ) {}

  async summary(companyId: string) {
    const now = new Date();
    const open = openTenderWhere(now);
    const [newMatches24h, newMatches7d, openMatches, favorites, soon, recent] =
      await Promise.all([
        this.prisma.tenderMatch.count({
          where: {
            companyId,
            createdAt: { gte: new Date(now.getTime() - DAY) },
          },
        }),
        this.prisma.tenderMatch.count({
          where: {
            companyId,
            createdAt: { gte: new Date(now.getTime() - 7 * DAY) },
          },
        }),
        this.prisma.tenderMatch.count({ where: { companyId, tender: open } }),
        this.prisma.savedTender.count({
          where: { companyId, isFavorite: true },
        }),
        this.prisma.tenderMatch.findMany({
          where: {
            companyId,
            tender: { AND: [open, { submissionDeadline: { not: null } }] },
          },
          orderBy: { tender: { submissionDeadline: 'asc' } },
          take: 5,
          select: { tenderId: true },
        }),
        this.prisma.tenderMatch.findMany({
          where: { companyId, tender: open },
          orderBy: [{ createdAt: 'desc' }, { score: 'desc' }],
          take: 5,
          select: { tenderId: true },
        }),
      ]);

    const [deadlinesSoon, recentMatches, collection] = await Promise.all([
      this.tenders.listItemsByIds(
        companyId,
        soon.map((m) => m.tenderId),
      ),
      this.tenders.listItemsByIds(
        companyId,
        recent.map((m) => m.tenderId),
      ),
      this.collection(),
    ]);
    return {
      newMatches24h,
      newMatches7d,
      openMatches,
      favorites,
      deadlinesSoon,
      recentMatches,
      collection,
    };
  }

  /** État de la dernière collecte (un échec n'est jamais présenté comme « aucune annonce »). */
  private async collection() {
    const source = await this.prisma.source.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (!source) {
      return {
        sourceName: null,
        lastRunAt: null,
        lastOutcome: null,
        latestPublicationRef: null,
        latestPublicationDate: null,
      };
    }
    const [lastRun, latestPublication] = await Promise.all([
      this.prisma.sourceRun.findFirst({
        where: { sourceId: source.id },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.sourcePublication.findFirst({
        where: { sourceId: source.id },
        orderBy: [
          { publicationDate: { sort: 'desc', nulls: 'last' } },
          { fetchedAt: 'desc' },
        ],
      }),
    ]);
    return {
      sourceName: source.name,
      lastRunAt: lastRun ? (lastRun.finishedAt ?? lastRun.startedAt) : null,
      lastOutcome: lastRun?.outcome ?? null,
      latestPublicationRef: latestPublication?.externalRef ?? null,
      latestPublicationDate: toYmd(latestPublication?.publicationDate),
    };
  }
}
