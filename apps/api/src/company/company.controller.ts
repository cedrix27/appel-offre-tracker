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
import { CompanyId, CurrentUser, Roles } from '../common/decorators';
import { CompanyMemberGuard } from '../common/guards/company-member.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthUser } from '../common/request';
import { UuidParamPipe } from '../common/schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createMemberSchema,
  type CreateMemberInput,
  updateCompanySchema,
  type UpdateCompanyInput,
} from './company.schemas';
import { CompanyService } from './company.service';

@Controller('company')
@UseGuards(CompanyMemberGuard, RolesGuard)
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  get(@CompanyId() companyId: string) {
    return this.company.get(companyId);
  }

  @Patch()
  @Roles('COMPANY_ADMIN')
  update(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(updateCompanySchema)) body: UpdateCompanyInput,
  ) {
    return this.company.update(companyId, body);
  }

  @Get('members')
  members(@CompanyId() companyId: string) {
    return this.company.listMembers(companyId);
  }

  @Post('members')
  @Roles('COMPANY_ADMIN')
  addMember(
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMemberSchema)) body: CreateMemberInput,
  ) {
    return this.company.addMember(companyId, user, body);
  }

  @Delete('members/:id')
  @Roles('COMPANY_ADMIN')
  @HttpCode(204)
  async removeMember(
    @CompanyId() companyId: string,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    await this.company.removeMember(companyId, id);
  }
}
