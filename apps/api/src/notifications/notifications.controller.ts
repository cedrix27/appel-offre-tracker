import { Controller, Get, UseGuards } from '@nestjs/common';
import { Notification } from '@prisma/client';
import { toYmd } from '../common/dates';
import { CompanyId } from '../common/decorators';
import { CompanyMemberGuard } from '../common/guards/company-member.guard';
import { PrismaService } from '../prisma/prisma.service';

export function toNotificationDto(n: Notification) {
  return {
    id: n.id,
    digestDate: toYmd(n.digestDate),
    status: n.status,
    recipients: n.recipients,
    tenderCount: n.tenderIds.length,
    subject: n.subject,
    sentAt: n.sentAt,
    error: n.error,
  };
}

@Controller('notifications')
@UseGuards(CompanyMemberGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CompanyId() companyId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { companyId },
      orderBy: [{ digestDate: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return rows.map(toNotificationDto);
  }
}
