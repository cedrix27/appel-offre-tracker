import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { dateOnly } from '../common/dates';
import { MailService } from '../mail/mail.service';
import { openTenderWhere } from '../matching/matching.service';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { parseReasons } from '../tenders/tender.mapper';
import { buildDigestEmail, DigestTender } from './digest.template';

export const MAX_TENDERS_PER_DIGEST = 50;

export interface DigestStats {
  sent: number;
  skipped: number;
  failed: number;
  alreadyProcessed: number;
}

export function digestKey(companyId: string, date: string): string {
  return `digest:${companyId}:${date}`;
}

@Injectable()
export class DigestService {
  private readonly logger = new Logger('DigestService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {}

  /** Sources actives dont la dernière collecte est en échec. */
  async failedSourceNames(): Promise<string[]> {
    const sources = await this.prisma.source.findMany({
      where: { status: 'ACTIVE' },
      include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } },
      orderBy: { name: 'asc' },
    });
    return sources
      .filter((s) => s.runs[0]?.outcome === 'FAILED')
      .map((s) => s.name);
  }

  /** Un digest par entreprise active et par jour (clé digest:<companyId>:<date>). */
  async runDigests(date: string): Promise<DigestStats> {
    const stats: DigestStats = {
      sent: 0,
      skipped: 0,
      failed: 0,
      alreadyProcessed: 0,
    };
    const failedSources = await this.failedSourceNames();
    const companies = await this.prisma.company.findMany({
      where: { status: 'ACTIVE', preferences: { some: { isActive: true } } },
      orderBy: { createdAt: 'asc' },
    });
    for (const company of companies) {
      try {
        const outcome = await this.digestForCompany(
          company.id,
          date,
          failedSources,
        );
        if (outcome === 'SENT') stats.sent += 1;
        else if (outcome === 'SKIPPED') stats.skipped += 1;
        else if (outcome === 'FAILED') stats.failed += 1;
        else stats.alreadyProcessed += 1;
      } catch (err) {
        stats.failed += 1;
        this.logger.error(
          `Digest ${company.id} : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return stats;
  }

  async digestForCompany(
    companyId: string,
    date: string,
    failedSources: string[],
  ): Promise<'SENT' | 'SKIPPED' | 'FAILED' | 'ALREADY_PROCESSED'> {
    // 1. Insertion d'abord : la contrainte unique empêche tout double envoi.
    let notificationId: string;
    try {
      const n = await this.prisma.notification.create({
        data: {
          companyId,
          kind: 'DAILY_DIGEST',
          digestDate: dateOnly(date),
          idempotencyKey: digestKey(companyId, date),
          status: 'QUEUED',
        },
      });
      notificationId = n.id;
    } catch (err) {
      if (isUniqueViolation(err)) return 'ALREADY_PROCESSED';
      throw err;
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      include: {
        preferences: { where: { isActive: true } },
        members: { include: { user: true } },
      },
    });
    const matches = await this.prisma.tenderMatch.findMany({
      where: { companyId, notifiedAt: null, tender: openTenderWhere() },
      include: { tender: { include: { source: true } } },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
      take: MAX_TENDERS_PER_DIGEST,
    });

    if (matches.length === 0) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: 'SKIPPED',
          error: failedSources.length
            ? `Collecte en échec (${failedSources.join(', ')}) : aucune annonce à envoyer, ce n’est pas une journée sans appel d’offres.`
            : null,
        },
      });
      return 'SKIPPED';
    }

    const fromPrefs = [
      ...new Set(company.preferences.flatMap((p) => p.recipients)),
    ];
    const recipients = fromPrefs.length
      ? fromPrefs
      : company.members
          .filter((m) => m.user.emailVerifiedAt && m.user.status === 'ACTIVE')
          .map((m) => m.user.email);
    const tenderIds = matches.map((m) => m.tenderId);
    if (recipients.length === 0) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: 'FAILED',
          tenderIds,
          error: 'Aucun destinataire disponible',
        },
      });
      return 'FAILED';
    }

    const tenders: DigestTender[] = matches.map((m) => ({
      id: m.tender.id,
      title: m.tender.title,
      reference: m.tender.reference,
      organization: m.tender.organization,
      description: m.tender.description,
      summary: m.tender.summary,
      location: m.tender.location,
      procedureType: m.tender.procedureType,
      submissionDeadline: m.tender.submissionDeadline,
      deadlineHasTime: m.tender.deadlineHasTime,
      estimatedBudget: m.tender.estimatedBudget,
      budgetTaxBasis: m.tender.budgetTaxBasis,
      sourceUrl: m.tender.sourceUrl,
      sourceName: m.tender.source.name,
      missingOrUncertainFields: m.tender.missingOrUncertainFields,
      score: m.score,
      reasons: parseReasons(m.reasons),
    }));
    const message = buildDigestEmail({
      companyName: company.tradeName ?? company.legalName,
      digestDate: date,
      generatedAt: new Date(),
      timeZone: this.config.env.TENDER_TIMEZONE,
      webAppUrl: this.config.env.WEB_APP_URL,
      tenders,
      failedSources,
      recipients,
    });
    const outcome = await this.mail.send(message);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: outcome.status,
          recipients,
          tenderIds,
          subject: message.subject,
          provider: outcome.provider,
          providerMessageId: outcome.messageId,
          error: outcome.error,
          attempts: 1,
          sentAt: outcome.status === 'SENT' ? now : null,
        },
      }),
      ...(outcome.status === 'SENT'
        ? [
            this.prisma.tenderMatch.updateMany({
              where: { id: { in: matches.map((m) => m.id) }, notifiedAt: null },
              data: { notifiedAt: now },
            }),
          ]
        : []),
    ]);
    return outcome.status;
  }
}
