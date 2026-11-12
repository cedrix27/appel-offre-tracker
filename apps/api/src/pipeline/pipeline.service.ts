import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CollectorJob, Prisma, Source } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { dateInTimeZone, dateOnly } from '../common/dates';
import { MatchingService } from '../matching/matching.service';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CollectorRunnerService } from './collector-runner.service';
import { DigestService } from './digest.service';

export type PipelineTrigger = 'CRON' | 'ADMIN';

export interface PipelineOptions {
  date?: string;
  trigger: PipelineTrigger;
  sourceId?: string;
  requestedBy?: string;
}

interface PlannedJob {
  source: Source;
  job: CollectorJob | null;
  skipReason: string | null;
}

export interface PipelineStep {
  step: 'collect' | 'matching' | 'digest';
  [key: string]: Prisma.JsonValue;
}

export interface PipelineResult {
  pipelineRunId: string;
  status: 'DONE' | 'FAILED';
  steps: PipelineStep[];
}

export function collectKey(code: string, date: string): string {
  return `collect:${code}:${date}`;
}

@Injectable()
export class PipelineService {
  private readonly logger = new Logger('PipelineService');
  /** Sources dont un job est en cours d'exécution dans ce processus. */
  private readonly runningSources = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly runner: CollectorRunnerService,
    private readonly matching: MatchingService,
    private readonly digest: DigestService,
  ) {}

  today(): string {
    return dateInTimeZone(new Date(), this.config.env.TENDER_TIMEZONE);
  }

  /** Exécute le pipeline complet et attend sa fin. */
  async run(opts: PipelineOptions): Promise<PipelineResult> {
    const prepared = await this.prepare(opts);
    return this.execute(prepared.pipelineRunId, prepared.date, prepared.plan);
  }

  /** Prépare (ligne pipeline_runs + jobs) puis exécute en arrière-plan. */
  async start(
    opts: PipelineOptions,
  ): Promise<{ pipelineRunId: string; jobIds: string[] }> {
    const prepared = await this.prepare(opts);
    void this.execute(
      prepared.pipelineRunId,
      prepared.date,
      prepared.plan,
    ).catch((err: unknown) =>
      this.logger.error(`Pipeline ${prepared.pipelineRunId} : ${String(err)}`),
    );
    return {
      pipelineRunId: prepared.pipelineRunId,
      jobIds: prepared.plan.flatMap((p) => (p.job ? [p.job.id] : [])),
    };
  }

  /** Relance contrôlée d'une source (admin) : 409 si un job est déjà en cours. */
  async startForSource(sourceId: string, requestedBy: string) {
    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
    });
    if (!source) throw new NotFoundException('Source introuvable');
    await this.assertNotRunning(sourceId);
    const prepared = await this.prepare({
      trigger: 'ADMIN',
      sourceId,
      requestedBy,
    });
    const planned = prepared.plan[0];
    void this.execute(
      prepared.pipelineRunId,
      prepared.date,
      prepared.plan,
    ).catch((err: unknown) =>
      this.logger.error(`Pipeline ${prepared.pipelineRunId} : ${String(err)}`),
    );
    return {
      jobId: planned?.job?.id ?? null,
      pipelineRunId: prepared.pipelineRunId,
      skipped: planned?.skipReason ?? null,
    };
  }

  private async assertNotRunning(sourceId: string): Promise<void> {
    const running = await this.prisma.collectorJob.findFirst({
      where: { sourceId, status: 'RUNNING' },
    });
    if (running || this.runningSources.has(sourceId)) {
      throw new ConflictException({
        message: 'Une collecte est déjà en cours pour cette source',
        code: 'JOB_RUNNING',
      });
    }
  }

  private async prepare(opts: PipelineOptions) {
    const date = opts.date ?? this.today();
    const run = await this.prisma.pipelineRun.create({
      data: {
        runDate: dateOnly(date),
        trigger: opts.trigger,
        status: 'RUNNING',
      },
    });
    const sources = await this.prisma.source.findMany({
      where: opts.sourceId ? { id: opts.sourceId } : { status: 'ACTIVE' },
      orderBy: { code: 'asc' },
    });
    const plan: PlannedJob[] = [];
    for (const source of sources) {
      plan.push(await this.planJob(source, date, opts));
    }
    return { pipelineRunId: run.id, date, plan };
  }

  /**
   * Clé `collect:<code>:<date>` : déjà DONE → rien ; RUNNING → rien ; PENDING → reprise ;
   * FAILED → nouvelle tentative `:retry-<n>` uniquement sur relance admin.
   */
  private async planJob(
    source: Source,
    date: string,
    opts: PipelineOptions,
  ): Promise<PlannedJob> {
    if (this.runningSources.has(source.id)) {
      return { source, job: null, skipReason: 'Collecte déjà en cours' };
    }
    const base = collectKey(source.code, date);
    const jobs = await this.prisma.collectorJob.findMany({
      where: {
        OR: [
          { idempotencyKey: base },
          { idempotencyKey: { startsWith: `${base}:retry-` } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (jobs.some((j) => j.status === 'DONE')) {
      return {
        source,
        job: null,
        skipReason: 'Collecte du jour déjà effectuée',
      };
    }
    if (jobs.some((j) => j.status === 'RUNNING')) {
      return { source, job: null, skipReason: 'Collecte déjà en cours' };
    }
    const pending = jobs.find((j) => j.status === 'PENDING');
    if (pending) return { source, job: pending, skipReason: null };
    if (jobs.length > 0 && opts.trigger !== 'ADMIN') {
      return {
        source,
        job: null,
        skipReason: 'Collecte du jour en échec (relance admin requise)',
      };
    }
    const key = jobs.length === 0 ? base : `${base}:retry-${jobs.length}`;
    try {
      const job = await this.prisma.collectorJob.create({
        data: {
          sourceId: source.id,
          kind: 'COLLECT',
          payload: { maxPublications: 3 },
          idempotencyKey: key,
          requestedBy: opts.requestedBy ?? null,
        },
      });
      return { source, job, skipReason: null };
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { source, job: null, skipReason: 'Job créé en parallèle' };
      }
      throw err;
    }
  }

  private async execute(
    runId: string,
    date: string,
    plan: PlannedJob[],
  ): Promise<PipelineResult> {
    const steps: PipelineStep[] = [];
    const saveSteps = () =>
      this.prisma.pipelineRun.update({
        where: { id: runId },
        data: { steps: steps },
      });
    const failures: string[] = [];
    let fatal: string | null = null;
    try {
      for (const planned of plan) {
        const step = await this.collect(planned);
        steps.push(step);
        if (step.status === 'FAILED') failures.push(planned.source.code);
        await saveSteps();
      }
      const matchStats = await this.matching.matchAll();
      steps.push({ step: 'matching', status: 'DONE', ...matchStats });
      await saveSteps();
      const digestStats = await this.digest.runDigests(date);
      steps.push({ step: 'digest', status: 'DONE', ...digestStats });
    } catch (err) {
      fatal = err instanceof Error ? err.message : String(err);
      this.logger.error(`Pipeline ${runId} interrompu : ${fatal}`);
    }
    const status = fatal || failures.length ? 'FAILED' : 'DONE';
    const error =
      fatal ??
      (failures.length ? `Collecte en échec : ${failures.join(', ')}` : null);
    await this.prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status,
        error,
        steps: steps,
        finishedAt: new Date(),
      },
    });
    return { pipelineRunId: runId, status, steps };
  }

  private async collect(planned: PlannedJob): Promise<PipelineStep> {
    const { source, job } = planned;
    if (!job) {
      return {
        step: 'collect',
        source: source.code,
        status: 'SKIPPED',
        detail: planned.skipReason,
      };
    }
    this.runningSources.add(source.id);
    try {
      const res = await this.runner.run(job.id);
      const after = await this.prisma.collectorJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      if (after.status === 'DONE') {
        return {
          step: 'collect',
          source: source.code,
          jobId: job.id,
          status: 'DONE',
          exitCode: res.exitCode,
        };
      }
      let message: string;
      if (res.spawnError)
        message = `Impossible de lancer le collecteur : ${res.spawnError}`;
      else if (res.timedOut) {
        message = `Délai dépassé (${Math.round(this.config.env.COLLECTOR_TIMEOUT_MS / 60000)} min) : collecteur interrompu`;
      } else if (res.exitCode !== 0) {
        message = `Le collecteur s'est arrêté avec le code ${res.exitCode}${res.stderrTail ? ` : ${res.stderrTail}` : ''}`;
      } else message = "Le collecteur s'est terminé sans mettre à jour le job";
      await this.recordFailure(
        job,
        after.status === 'FAILED' ? (after.lastError ?? message) : message,
        after.status !== 'FAILED',
      );
      return {
        step: 'collect',
        source: source.code,
        jobId: job.id,
        status: 'FAILED',
        exitCode: res.exitCode,
        error: after.lastError ?? message,
      };
    } finally {
      this.runningSources.delete(source.id);
    }
  }

  /** Garantit que l'échec est visible : job FAILED et source_run FAILED clos. */
  private async recordFailure(
    job: CollectorJob,
    message: string,
    markJob: boolean,
  ): Promise<void> {
    const now = new Date();
    if (markJob) {
      await this.prisma.collectorJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          lastError: message,
          finishedAt: now,
          attempts: { increment: 1 },
        },
      });
    }
    const runs = await this.prisma.sourceRun.findMany({
      where: { jobId: job.id },
    });
    const open = runs.filter((r) => r.outcome === 'RUNNING');
    if (runs.length === 0) {
      await this.prisma.sourceRun.create({
        data: {
          sourceId: job.sourceId,
          jobId: job.id,
          startedAt: job.createdAt,
          finishedAt: now,
          outcome: 'FAILED',
          errorMessage: message,
          log: [{ at: now.toISOString(), level: 'error', message }],
        },
      });
    } else if (open.length > 0) {
      await this.prisma.sourceRun.updateMany({
        where: { id: { in: open.map((r) => r.id) } },
        data: { outcome: 'FAILED', finishedAt: now, errorMessage: message },
      });
    }
  }
}
