import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toYmd } from '../common/dates';
import type { Paginated } from '../common/schemas';
import { toNotificationDto } from '../notifications/notifications.controller';
import { PipelineService } from '../pipeline/pipeline.service';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdminNotificationsQuery,
  AdminTendersQuery,
  CreateSourceInput,
  PageInput,
  SourceRunsQuery,
  StatusInput,
  UpdateSourceInput,
} from './admin.schemas';

function page<T>(items: T[], total: number, q: PageInput): Paginated<T> {
  return { items, total, page: q.page, pageSize: q.pageSize };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
  ) {}

  private audit(
    actorUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Prisma.InputJsonObject = {},
    companyId: string | null = null,
  ) {
    return this.prisma.auditLog.create({
      data: { actorUserId, action, targetType, targetId, metadata, companyId },
    });
  }

  async stats() {
    const [
      companies,
      users,
      tenders,
      matches,
      emailsSent,
      emailsFailed,
      lastPipeline,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.user.count(),
      this.prisma.tender.count(),
      this.prisma.tenderMatch.count(),
      this.prisma.emailOutbox.count({ where: { status: 'SENT' } }),
      this.prisma.emailOutbox.count({ where: { status: 'FAILED' } }),
      this.prisma.pipelineRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    ]);
    return {
      companies,
      users,
      tenders,
      matches,
      emailsSent,
      emailsFailed,
      lastPipelineRun: lastPipeline ? this.pipelineRunDto(lastPipeline) : null,
    };
  }

  async companies() {
    const rows = await this.prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { members: true, matches: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      legalName: c.legalName,
      tradeName: c.tradeName,
      email: c.email,
      city: c.city,
      status: c.status,
      membersCount: c._count.members,
      matchesCount: c._count.matches,
      createdAt: c.createdAt,
    }));
  }

  async setCompanyStatus(actorId: string, id: string, input: StatusInput) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Entreprise introuvable');
    const updated = await this.prisma.company.update({
      where: { id },
      data: { status: input.status },
    });
    if (input.status === 'SUSPENDED') {
      await this.prisma.authToken.updateMany({
        where: {
          type: 'REFRESH',
          usedAt: null,
          user: { memberships: { some: { companyId: id } } },
        },
        data: { usedAt: new Date() },
      });
    }
    await this.audit(
      actorId,
      input.status === 'SUSPENDED' ? 'company.suspend' : 'company.activate',
      'company',
      id,
      { from: company.status, to: input.status },
      id,
    );
    return {
      id: updated.id,
      legalName: updated.legalName,
      status: updated.status,
    };
  }

  async users() {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          include: { company: { select: { id: true, legalName: true } } },
        },
      },
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      globalRole: u.globalRole,
      status: u.status,
      emailVerified: u.emailVerifiedAt !== null,
      invitedPending: u.passwordHash === null,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      companies: u.memberships.map((m) => ({
        id: m.company.id,
        legalName: m.company.legalName,
        role: m.role,
      })),
    }));
  }

  async setUserStatus(actorId: string, id: string, input: StatusInput) {
    if (id === actorId && input.status === 'SUSPENDED') {
      throw new BadRequestException({
        message: 'Vous ne pouvez pas suspendre votre propre compte',
        code: 'CANNOT_SUSPEND_SELF',
      });
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: input.status },
    });
    if (input.status === 'SUSPENDED') {
      await this.prisma.authToken.updateMany({
        where: { userId: id, type: 'REFRESH', usedAt: null },
        data: { usedAt: new Date() },
      });
    }
    await this.audit(
      actorId,
      input.status === 'SUSPENDED' ? 'user.suspend' : 'user.activate',
      'user',
      id,
      { from: user.status, to: input.status },
    );
    return { id: updated.id, email: updated.email, status: updated.status };
  }

  async sources() {
    const rows = await this.prisma.source.findMany({
      orderBy: { code: 'asc' },
      include: {
        runs: { orderBy: { startedAt: 'desc' }, take: 1 },
        _count: { select: { tenders: true } },
      },
    });
    return rows.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      baseUrl: s.baseUrl,
      type: s.type,
      accessMethod: s.accessMethod,
      frequencyCron: s.frequencyCron,
      status: s.status,
      lastSuccessAt: s.lastSuccessAt,
      errorRate: s.errorRate,
      notes: s.notes,
      tendersCount: s._count.tenders,
      lastRun: s.runs[0]
        ? {
            id: s.runs[0].id,
            startedAt: s.runs[0].startedAt,
            finishedAt: s.runs[0].finishedAt,
            outcome: s.runs[0].outcome,
            errorMessage: s.runs[0].errorMessage,
          }
        : null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  async createSource(actorId: string, input: CreateSourceInput) {
    try {
      const source = await this.prisma.source.create({
        data: { ...input, notes: input.notes ?? null },
      });
      await this.audit(actorId, 'source.create', 'source', source.id, {
        code: source.code,
      });
      return source;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          message: 'Ce code de source existe déjà',
          code: 'SOURCE_CODE_TAKEN',
        });
      }
      throw err;
    }
  }

  async updateSource(actorId: string, id: string, input: UpdateSourceInput) {
    const existing = await this.prisma.source.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Source introuvable');
    const source = await this.prisma.source.update({
      where: { id },
      data: input,
    });
    await this.audit(actorId, 'source.update', 'source', id, {
      fields: Object.keys(input),
    });
    return source;
  }

  async runSource(actorId: string, id: string) {
    const res = await this.pipeline.startForSource(id, actorId);
    await this.audit(actorId, 'source.run', 'source', id, {
      jobId: res.jobId,
      pipelineRunId: res.pipelineRunId,
    });
    return { jobId: res.jobId, runId: res.pipelineRunId, skipped: res.skipped };
  }

  async sourceRuns(q: SourceRunsQuery) {
    const where: Prisma.SourceRunWhereInput = {
      ...(q.sourceId ? { sourceId: q.sourceId } : {}),
      ...(q.outcome ? { outcome: q.outcome } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.sourceRun.count({ where }),
      this.prisma.sourceRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { source: { select: { code: true, name: true } } },
      }),
    ]);
    return page(
      rows.map((r) => ({
        id: r.id,
        source: r.source,
        sourceId: r.sourceId,
        jobId: r.jobId,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        outcome: r.outcome,
        publicationsFound: r.publicationsFound,
        itemsFound: r.itemsFound,
        itemsNew: r.itemsNew,
        itemsUpdated: r.itemsUpdated,
        errorMessage: r.errorMessage,
        log: r.log,
      })),
      total,
      q,
    );
  }

  async tenders(q: AdminTendersQuery) {
    const where: Prisma.TenderWhereInput = {
      ...(q.sourceId ? { sourceId: q.sourceId } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: 'insensitive' } },
              { organization: { contains: q.q, mode: 'insensitive' } },
              { reference: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.tender.count({ where }),
      this.prisma.tender.findMany({
        where,
        orderBy: { collectedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          source: { select: { code: true, name: true } },
          publication: { select: { externalRef: true, publicationDate: true } },
          _count: { select: { matches: true } },
        },
      }),
    ]);
    return page(
      rows.map((t) => ({
        id: t.id,
        title: t.title,
        reference: t.reference,
        organization: t.organization,
        sectors: t.sectors,
        procedureType: t.procedureType,
        publicationDate: toYmd(t.publicationDate),
        submissionDeadline: t.submissionDeadline,
        estimatedBudget:
          t.estimatedBudget === null ? null : Number(t.estimatedBudget),
        status: t.status,
        source: t.source,
        sourceUrl: t.sourceUrl,
        sourcePages: t.sourcePages,
        publication: t.publication
          ? {
              externalRef: t.publication.externalRef,
              publicationDate: toYmd(t.publication.publicationDate),
            }
          : null,
        extractionModel: t.extractionModel,
        extractedAt: t.extractedAt,
        missingOrUncertainFields: t.missingOrUncertainFields,
        evidence: t.evidence,
        collectedAt: t.collectedAt,
        lastVerifiedAt: t.lastVerifiedAt,
        matchedAt: t.matchedAt,
        matchesCount: t._count.matches,
      })),
      total,
      q,
    );
  }

  async notifications(q: AdminNotificationsQuery) {
    const where: Prisma.NotificationWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.companyId ? { companyId: q.companyId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { company: { select: { id: true, legalName: true } } },
      }),
    ]);
    return page(
      rows.map((n) => ({
        ...toNotificationDto(n),
        company: n.company,
        provider: n.provider,
        attempts: n.attempts,
        createdAt: n.createdAt,
      })),
      total,
      q,
    );
  }

  async runPipeline(actorId: string, date?: string) {
    const res = await this.pipeline.start({
      trigger: 'ADMIN',
      date,
      requestedBy: actorId,
    });
    await this.audit(
      actorId,
      'pipeline.run',
      'pipeline_run',
      res.pipelineRunId,
      {
        date: date ?? null,
      },
    );
    return res;
  }

  private pipelineRunDto(r: {
    id: string;
    runDate: Date;
    trigger: string;
    status: string;
    steps: Prisma.JsonValue;
    startedAt: Date;
    finishedAt: Date | null;
    error: string | null;
  }) {
    return {
      id: r.id,
      runDate: toYmd(r.runDate),
      trigger: r.trigger,
      status: r.status,
      steps: r.steps,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      error: r.error,
    };
  }

  async pipelineRuns(q: PageInput) {
    const [total, rows] = await Promise.all([
      this.prisma.pipelineRun.count(),
      this.prisma.pipelineRun.findMany({
        orderBy: { startedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return page(
      rows.map((r) => this.pipelineRunDto(r)),
      total,
      q,
    );
  }
}
