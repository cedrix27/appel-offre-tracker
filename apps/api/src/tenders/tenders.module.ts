import { Global, Module } from '@nestjs/common';
import { TendersController } from './tenders.controller';
import { TendersService } from './tenders.service';

@Global()
@Module({
  controllers: [TendersController],
  providers: [TendersService],
  exports: [TendersService],
})
export class TendersModule {}
