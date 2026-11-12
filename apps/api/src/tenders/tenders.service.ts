import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Paginated } from '../common/schemas';
import { PrismaService } from '../prisma/prisma.service';
import {
  TenderListItem,
  toTenderDetail,
  toTenderListItem,
} from './tender.mapper';
import type { ListTendersQuery, StatusInput } from './tenders.schemas';

export function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

@Injectable()
export class TendersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Liste d'éléments TenderListItem, dans l'ordre des ids, avec match/favori de l'entreprise. */
  async listItemsByIds(
    companyId: string,
    ids: string[],
  ): Promise<TenderListItem[]> {
    if (ids.length === 0) return [];
    const [tenders, matches, saved] = await Promise.all([
      this.prisma.tender.findMany({
        where: { id: { in: ids } },
        include: { source: { select: { code: true, name: true } } },
      }),
      this.prisma.tenderMatch.findMany({
        where: { companyId, tenderId: { in: ids } },
      }),
      this.prisma.savedTender.findMany({
        where: { companyId, tenderId: { in: ids } },
      }),
    ]);
    const byId = new Map(tenders.map((t) => [t.id, t]));
    const matchBy = new Map(matches.map((m) => [m.tenderId, m]));
    const savedBy = new Map(saved.map((s) => [s.tenderId, s]));
    const now = new Date();
    return ids.flatMap((id) => {
      const t = byId.get(id);
      return t
        ? [toTenderListItem(t, matchBy.get(id), savedBy.get(id), now)]
        : [];
    });
  }

  async list(
    companyId: string,
    q: ListTendersQuery,
  ): Promise<Paginated<TenderListItem>> {
    const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (q.onlyMatched) conds.push(Prisma.sql`m.id IS NOT NULL`);
    if (q.favorite === true) conds.push(Prisma.sql`s.is_favorite = TRUE`);
    if (q.favorite === false)
      conds.push(Prisma.sql`(s.id IS NULL OR s.is_favorite = FALSE)`);
    if (q.savedStatus) {
      conds.push(Prisma.sql`s.status = ${q.savedStatus}::"SavedStatus"`);
    }
    if (!q.includeClosed) {
      conds.push(
        Prisma.sql`t.status NOT IN ('CLOSED', 'CANCELLED', 'AWARDED')
          AND (t.submission_deadline IS NULL
            OR (t.deadline_has_time AND t.submission_deadline >= now())
            OR (NOT t.deadline_has_time AND t.submission_deadline + interval '1 day' > now()))`,
      );
    }
    if (q.q) {
      const p = likePattern(q.q);
      conds.push(
        Prisma.sql`(t.title ILIKE ${p} OR t.organization ILIKE ${p}
          OR t.description ILIKE ${p} OR t.reference ILIKE ${p})`,
      );
    }
    if (q.sector) conds.push(Prisma.sql`${q.sector} = ANY(t.sectors)`);
    if (q.organization)
      conds.push(Prisma.sql`t.organization = ${q.organization}`);
    if (q.region)
      conds.push(Prisma.sql`t.location ILIKE ${likePattern(q.region)}`);
    if (q.procedureType)
      conds.push(Prisma.sql`t.procedure_type = ${q.procedureType}`);
    if (q.from) conds.push(Prisma.sql`t.publication_date >= ${q.from}::date`);
    if (q.to) conds.push(Prisma.sql`t.publication_date <= ${q.to}::date`);
    if (q.deadlineFrom) {
      conds.push(Prisma.sql`t.submission_deadline >= ${q.deadlineFrom}::date`);
    }
    if (q.deadlineTo) {
      conds.push(
        Prisma.sql`t.submission_deadline < (${q.deadlineTo}::date + 1)`,
      );
    }

    const orderBy = {
      relevance: Prisma.sql`m.score DESC NULLS LAST, t.publication_date DESC NULLS LAST, t.created_at DESC, t.id`,
      deadline: Prisma.sql`t.submission_deadline ASC NULLS LAST, t.created_at DESC, t.id`,
      recent: Prisma.sql`t.publication_date DESC NULLS LAST, t.created_at DESC, t.id`,
    }[q.sort];

    const from = Prisma.sql`
      FROM tenders t
      LEFT JOIN tender_matches m ON m.tender_id = t.id AND m.company_id = ${companyId}::uuid
      LEFT JOIN saved_tenders s ON s.tender_id = t.id AND s.company_id = ${companyId}::uuid
      WHERE ${Prisma.join(conds, ' AND ')}`;

    const [countRows, idRows] = await Promise.all([
      this.prisma.$queryRaw<
        { total: bigint }[]
      >`SELECT COUNT(*)::bigint AS total ${from}`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT t.id ${from}
        ORDER BY ${orderBy}
        LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    ]);
    return {
      items: await this.listItemsByIds(
        companyId,
        idRows.map((r) => r.id),
      ),
      total: Number(countRows[0]?.total ?? 0),
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async detail(companyId: string, id: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      include: {
        source: { select: { code: true, name: true } },
        documents: { orderBy: { createdAt: 'asc' } },
        publication: true,
      },
    });
    if (!tender) throw new NotFoundException('Annonce introuvable');
    const [match, saved] = await Promise.all([
      this.prisma.tenderMatch.findUnique({
        where: { companyId_tenderId: { companyId, tenderId: id } },
      }),
      this.prisma.savedTender.findUnique({
        where: { companyId_tenderId: { companyId, tenderId: id } },
      }),
    ]);
    return toTenderDetail(tender, match, saved);
  }

  private async assertExists(id: string): Promise<void> {
    const found = await this.prisma.tender.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Annonce introuvable');
  }

  async setFavorite(
    companyId: string,
    userId: string,
    tenderId: string,
    isFavorite: boolean,
  ) {
    await this.assertExists(tenderId);
    const saved = await this.prisma.savedTender.upsert({
      where: { companyId_tenderId: { companyId, tenderId } },
      create: { companyId, tenderId, userId, isFavorite },
      update: { userId, isFavorite },
    });
    return { isFavorite: saved.isFavorite, status: saved.status };
  }

  async setStatus(
    companyId: string,
    userId: string,
    tenderId: string,
    input: StatusInput,
  ) {
    await this.assertExists(tenderId);
    const note = input.note === undefined ? undefined : input.note || null;
    const saved = await this.prisma.savedTender.upsert({
      where: { companyId_tenderId: { companyId, tenderId } },
      create: {
        companyId,
        tenderId,
        userId,
        status: input.status,
        note: note ?? null,
      },
      update: { userId, status: input.status, note },
    });
    return {
      isFavorite: saved.isFavorite,
      status: saved.status,
      note: saved.note,
    };
  }

  async filters() {
    const [orgs, sectors, procs, locs] = await Promise.all([
      this.prisma.$queryRaw<{ v: string }[]>`
        SELECT DISTINCT organization AS v FROM tenders WHERE organization IS NOT NULL ORDER BY 1`,
      this.prisma.$queryRaw<{ v: string }[]>`
        SELECT DISTINCT unnest(sectors) AS v FROM tenders ORDER BY 1`,
      this.prisma.$queryRaw<{ v: string }[]>`
        SELECT DISTINCT procedure_type AS v FROM tenders WHERE procedure_type IS NOT NULL ORDER BY 1`,
      this.prisma.$queryRaw<{ v: string }[]>`
        SELECT DISTINCT location AS v FROM tenders WHERE location IS NOT NULL ORDER BY 1`,
    ]);
    const values = (rows: { v: string }[]) => rows.map((r) => r.v);
    return {
      organizations: values(orgs),
      sectors: values(sectors),
      procedureTypes: values(procs),
      locations: values(locs),
    };
  }
}
