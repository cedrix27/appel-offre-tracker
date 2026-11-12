import { Global, Module } from '@nestjs/common';
import { CollectorRunnerService } from './collector-runner.service';
import { DigestService } from './digest.service';
import { PipelineScheduler } from './pipeline.scheduler';
import { PipelineService } from './pipeline.service';

@Global()
@Module({
  providers: [
    CollectorRunnerService,
    DigestService,
    PipelineService,
    PipelineScheduler,
  ],
  exports: [PipelineService, DigestService],
})
export class PipelineModule {}
