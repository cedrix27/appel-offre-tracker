import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CompanyId, Roles } from '../common/decorators';
import { CompanyMemberGuard } from '../common/guards/company-member.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UuidParamPipe } from '../common/schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createPreferenceSchema,
  type CreatePreferenceInput,
  updatePreferenceSchema,
  type UpdatePreferenceInput,
} from './preferences.schemas';
import { PreferencesService } from './preferences.service';

/** Préférences de veille : lecture par tout membre, écriture par COMPANY_ADMIN. */
@Controller('watch-preferences')
@UseGuards(CompanyMemberGuard, RolesGuard)
export class PreferencesController {
  constructor(private readonly prefs: PreferencesService) {}

  @Get()
  list(@CompanyId() companyId: string) {
    return this.prefs.list(companyId);
  }

  @Post()
  @Roles('COMPANY_ADMIN')
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(createPreferenceSchema))
    body: CreatePreferenceInput,
  ) {
    return this.prefs.create(companyId, body);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN')
  update(
    @CompanyId() companyId: string,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updatePreferenceSchema))
    body: UpdatePreferenceInput,
  ) {
    return this.prefs.update(companyId, id, body);
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN')
  @HttpCode(204)
  async remove(
    @CompanyId() companyId: string,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    await this.prefs.remove(companyId, id);
  }
}
