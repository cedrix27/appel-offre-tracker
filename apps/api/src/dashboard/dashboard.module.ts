import { Module } from '@nestjs/common';
import { NotificationsController } from '../notifications/notifications.controller';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController, NotificationsController],
  providers: [DashboardService],
})
export class DashboardModule {}
