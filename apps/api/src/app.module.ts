import { ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CompanyModule } from './company/company.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AUTH_RATE_LIMITED } from './common/decorators';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AppConfig, AppConfigModule } from './config/app-config';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { MatchingModule } from './matching/matching.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { PreferencesModule } from './preferences/preferences.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReferenceController } from './reference/reference.controller';
import { TendersModule } from './tenders/tenders.module';

function isAuthRateLimited(ctx: ExecutionContext): boolean {
  return Reflect.getMetadata(AUTH_RATE_LIMITED, ctx.getHandler()) === true;
}

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          { name: 'default', ttl: 60_000, limit: config.env.GLOBAL_RATE_LIMIT },
          {
            name: 'auth',
            ttl: config.env.AUTH_RATE_TTL_MS,
            limit: config.env.AUTH_RATE_LIMIT,
            skipIf: (ctx) => !isAuthRateLimited(ctx),
          },
        ],
      }),
    }),
    MailModule,
    AuthModule,
    MatchingModule,
    TendersModule,
    PipelineModule,
    CompanyModule,
    PreferencesModule,
    DashboardModule,
    AdminModule,
  ],
  controllers: [HealthController, ReferenceController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
