import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthUser } from '../common/request';
import { UuidParamPipe } from '../common/schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  adminNotificationsQuery,
  type AdminNotificationsQuery,
  adminTendersQuery,
  type AdminTendersQuery,
  createSourceSchema,
  type CreateSourceInput,
  pageSchema,
  type PageInput,
  pipelineRunSchema,
  sourceRunsQuery,
  type SourceRunsQuery,
  statusSchema,
  type StatusInput,
  updateSourceSchema,
  type UpdateSourceInput,
} from './admin.schemas';
import { AdminService } from './admin.service';

@Controller('admin')
@Roles('SUPER_ADMIN')
@UseGuards(RolesGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('companies')
  companies() {
    return this.admin.companies();
  }

  @Patch('companies/:id')
  setCompanyStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(statusSchema)) body: StatusInput,
  ) {
    return this.admin.setCompanyStatus(user.id, id, body);
  }

  @Get('users')
  users() {
    return this.admin.users();
  }

  @Patch('users/:id')
  setUserStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(statusSchema)) body: StatusInput,
  ) {
    return this.admin.setUserStatus(user.id, id, body);
  }

  @Get('sources')
  sources() {
    return this.admin.sources();
  }

  @Post('sources')
  createSource(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSourceSchema)) body: CreateSourceInput,
  ) {
    return this.admin.createSource(user.id, body);
  }

  @Patch('sources/:id')
  updateSource(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateSourceSchema)) body: UpdateSourceInput,
  ) {
    return this.admin.updateSource(user.id, id, body);
  }

  @Post('sources/:id/run')
  @HttpCode(202)
  runSource(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
  ) {
    return this.admin.runSource(user.id, id);
  }

  @Get('source-runs')
  sourceRuns(
    @Query(new ZodValidationPipe(sourceRunsQuery)) query: SourceRunsQuery,
  ) {
    return this.admin.sourceRuns(query);
  }

  @Get('tenders')
  tenders(
    @Query(new ZodValidationPipe(adminTendersQuery)) query: AdminTendersQuery,
  ) {
    return this.admin.tenders(query);
  }

  @Get('notifications')
  notifications(
    @Query(new ZodValidationPipe(adminNotificationsQuery))
    query: AdminNotificationsQuery,
  ) {
    return this.admin.notifications(query);
  }

  @Post('pipeline/run')
  @HttpCode(202)
  runPipeline(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(pipelineRunSchema)) body: { date?: string },
  ) {
    return this.admin.runPipeline(user.id, body.date);
  }

  @Get('pipeline-runs')
  pipelineRuns(@Query(new ZodValidationPipe(pageSchema)) query: PageInput) {
    return this.admin.pipelineRuns(query);
  }
}
