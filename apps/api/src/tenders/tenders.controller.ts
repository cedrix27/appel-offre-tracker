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
import { CompanyId, CurrentUser } from '../common/decorators';
import { CompanyMemberGuard } from '../common/guards/company-member.guard';
import type { AuthUser } from '../common/request';
import { UuidParamPipe } from '../common/schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  favoriteSchema,
  listTendersSchema,
  type ListTendersQuery,
  statusSchema,
  type StatusInput,
} from './tenders.schemas';
import { TendersService } from './tenders.service';

@Controller('tenders')
@UseGuards(CompanyMemberGuard)
export class TendersController {
  constructor(private readonly tenders: TendersService) {}

  @Get()
  list(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(listTendersSchema)) query: ListTendersQuery,
  ) {
    return this.tenders.list(companyId, query);
  }

  @Get('filters')
  filters() {
    return this.tenders.filters();
  }

  @Get(':id')
  detail(
    @CompanyId() companyId: string,
    @Param('id', UuidParamPipe) id: string,
  ) {
    return this.tenders.detail(companyId, id);
  }

  @Post(':id/favorite')
  @HttpCode(200)
  favorite(
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(favoriteSchema)) body: { isFavorite: boolean },
  ) {
    return this.tenders.setFavorite(companyId, user.id, id, body.isFavorite);
  }

  @Patch(':id/status')
  status(
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(statusSchema)) body: StatusInput,
  ) {
    return this.tenders.setStatus(companyId, user.id, id, body);
  }
}
