import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Company } from '@prisma/client';
import { TokensService } from '../auth/tokens.service';
import type { AuthUser } from '../common/request';
import { MailService } from '../mail/mail.service';
import { MailTemplates } from '../mail/templates';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateMemberInput, UpdateCompanyInput } from './company.schemas';

export function toCompanyProfile(c: Company) {
  return {
    id: c.id,
    legalName: c.legalName,
    tradeName: c.tradeName,
    description: c.description,
    mainSector: c.mainSector,
    secondarySectors: c.secondarySectors,
    skills: c.skills,
    services: c.services,
    city: c.city,
    address: c.address,
    regions: c.regions,
    email: c.email,
    phone: c.phone,
    website: c.website,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
    private readonly templates: MailTemplates,
  ) {}

  async get(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException();
    return toCompanyProfile(company);
  }

  async update(companyId: string, input: UpdateCompanyInput) {
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: input,
    });
    return toCompanyProfile(company);
  }

  async listMembers(companyId: string) {
    const members = await this.prisma.companyMember.findMany({
      where: { companyId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      fullName: m.user.fullName,
      role: m.role,
      invitedPending: m.user.passwordHash === null,
      createdAt: m.createdAt,
    }));
  }

  async addMember(
    companyId: string,
    inviter: AuthUser,
    input: CreateMemberInput,
  ) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
    });
    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: input.email, fullName: input.fullName },
        });
        const member = await tx.companyMember.create({
          data: { companyId, userId: user.id, role: input.role },
        });
        return { user, member };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          message: 'Un compte existe déjà avec cette adresse e-mail',
          code: 'EMAIL_TAKEN',
        });
      }
      throw err;
    }
    const raw = await this.tokens.issue(created.user.id, 'INVITE');
    await this.mail.send(
      this.templates.invite(
        created.user.email,
        created.user.fullName,
        company.tradeName ?? company.legalName,
        inviter.fullName,
        raw,
      ),
    );
    return {
      id: created.member.id,
      userId: created.user.id,
      email: created.user.email,
      fullName: created.user.fullName,
      role: created.member.role,
      invitedPending: true,
      createdAt: created.member.createdAt,
    };
  }

  async removeMember(companyId: string, memberId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.companyMember.findFirst({
        where: { id: memberId, companyId },
        include: { user: true },
      });
      if (!member) throw new NotFoundException('Membre introuvable');
      if (member.role === 'COMPANY_ADMIN') {
        const admins = await tx.companyMember.count({
          where: { companyId, role: 'COMPANY_ADMIN' },
        });
        if (admins <= 1) {
          throw new ConflictException({
            message:
              'Impossible de retirer le dernier administrateur de l’entreprise',
            code: 'LAST_ADMIN',
          });
        }
      }
      await tx.companyMember.delete({ where: { id: member.id } });
      await tx.authToken.updateMany({
        where: { userId: member.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      // Invitation jamais acceptée et plus aucune entreprise : on supprime le compte vide.
      const remaining = await tx.companyMember.count({
        where: { userId: member.userId },
      });
      if (member.user.passwordHash === null && remaining === 0) {
        await tx.user.delete({ where: { id: member.userId } });
      }
    });
  }
}
