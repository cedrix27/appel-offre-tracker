import { Controller, Get, UseGuards } from '@nestjs/common';
import { CompanyId } from '../common/decorators';
import { CompanyMemberGuard } from '../common/guards/company-member.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(CompanyMemberGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@CompanyId() companyId: string) {
    return this.dashboard.summary(companyId);
  }
}
