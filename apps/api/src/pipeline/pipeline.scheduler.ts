import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AppConfig } from '../config/app-config';
import { PipelineService } from './pipeline.service';

export const PIPELINE_CRON_NAME = 'daily-pipeline';

/** Planification quotidienne (TENDER_SCAN_CRON, fuseau TENDER_TIMEZONE), si PIPELINE_CRON_ENABLED=true. */
@Injectable()
export class PipelineScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger('PipelineScheduler');

  constructor(
    private readonly config: AppConfig,
    private readonly registry: SchedulerRegistry,
    private readonly pipeline: PipelineService,
  ) {}

  onApplicationBootstrap(): void {
    const { PIPELINE_CRON_ENABLED, TENDER_SCAN_CRON, TENDER_TIMEZONE } =
      this.config.env;
    if (!PIPELINE_CRON_ENABLED) {
      this.logger.log(
        'Cron du pipeline désactivé (PIPELINE_CRON_ENABLED=false)',
      );
      return;
    }
    const job = CronJob.from({
      cronTime: TENDER_SCAN_CRON,
      timeZone: TENDER_TIMEZONE,
      start: false,
      onTick: async () => {
        try {
          await this.pipeline.run({ trigger: 'CRON' });
        } catch (err) {
          this.logger.error(`Pipeline planifié en échec : ${String(err)}`);
        }
      },
    });
    this.registry.addCronJob(PIPELINE_CRON_NAME, job);
    job.start();
    this.logger.log(
      `Pipeline planifié « ${TENDER_SCAN_CRON} » (${TENDER_TIMEZONE})`,
    );
  }
}
