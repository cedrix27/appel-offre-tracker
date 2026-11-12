import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AppRequest } from '../request';

/** Charge la membership de l'utilisateur et fixe req.companyId (jamais depuis le client). */
@Injectable()
export class CompanyMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw new UnauthorizedException();
    const membership = await this.prisma.companyMember.findFirst({
      where: { userId: req.user.id },
      include: { company: { select: { status: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) {
      throw new ForbiddenException({
        message: 'Aucune entreprise associée à ce compte',
        code: 'NO_COMPANY',
      });
    }
    if (membership.company.status !== 'ACTIVE') {
      throw new ForbiddenException({
        message: 'Compte entreprise suspendu',
        code: 'ACCOUNT_SUSPENDED',
      });
    }
    req.companyId = membership.companyId;
    req.memberRole = membership.role;
    return true;
  }
}
