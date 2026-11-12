import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import type { AuthUser } from '../common/request';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { MailTemplates } from '../mail/templates';
import { hashPassword, verifyPassword } from './password';
import { TokensService } from './tokens.service';
import { RegisterInput } from './auth.schemas';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

const INVALID_TOKEN = {
  message: 'Lien invalide ou expiré',
  code: 'INVALID_TOKEN',
};

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    globalRole: user.globalRole,
  };
}

@Injectable()
export class AuthService {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly templates: MailTemplates,
  ) {}

  async register(input: RegisterInput): Promise<AuthUser> {
    const passwordHash = await hashPassword(input.password);
    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: { legalName: input.companyName },
        });
        const created = await tx.user.create({
          data: {
            email: input.email,
            fullName: input.fullName,
            passwordHash,
          },
        });
        await tx.companyMember.create({
          data: {
            companyId: company.id,
            userId: created.id,
            role: 'COMPANY_ADMIN',
          },
        });
        return created;
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
    await this.sendVerification(user);
    return toAuthUser(user);
  }

  private async sendVerification(user: User): Promise<void> {
    const raw = await this.tokens.issue(user.id, 'EMAIL_VERIFY', {
      revokePrevious: true,
    });
    await this.mail.send(
      this.templates.verifyEmail(user.email, user.fullName, raw),
    );
  }

  async verifyEmail(raw: string): Promise<void> {
    const token = await this.tokens.consume(raw, 'EMAIL_VERIFY');
    if (!token) throw new BadRequestException(INVALID_TOKEN);
    await this.prisma.user.updateMany({
      where: { id: token.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  /** Réponse identique que le compte existe ou non (anti-énumération). */
  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt || !user.passwordHash) return;
    await this.sendVerification(user);
  }

  private async fakeVerify(password: string): Promise<void> {
    this.dummyHash ??= hashPassword('mot-de-passe-factice-jamais-utilise');
    await verifyPassword(await this.dummyHash, password);
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: AuthUser; tokens: SessionTokens }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const invalid = new UnauthorizedException({
      message: 'Identifiants invalides',
      code: 'INVALID_CREDENTIALS',
    });
    if (!user || !user.passwordHash) {
      await this.fakeVerify(password);
      throw invalid;
    }
    if (!(await verifyPassword(user.passwordHash, password))) throw invalid;
    await this.assertCanSignIn(user);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return { user: toAuthUser(user), tokens: await this.issueSession(user.id) };
  }

  private async assertCanSignIn(user: User): Promise<void> {
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        message: 'Adresse e-mail non vérifiée',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
    const suspended = new ForbiddenException({
      message: 'Compte suspendu',
      code: 'ACCOUNT_SUSPENDED',
    });
    if (user.status !== 'ACTIVE') throw suspended;
    const suspendedCompany = await this.prisma.companyMember.findFirst({
      where: { userId: user.id, company: { status: 'SUSPENDED' } },
    });
    if (suspendedCompany) throw suspended;
  }

  private async issueSession(userId: string): Promise<SessionTokens> {
    const accessToken = await this.jwt.signAsync({ sub: userId });
    const refreshToken = await this.tokens.issue(userId, 'REFRESH');
    return { accessToken, refreshToken };
  }

  /** Rotation : l'ancien refresh est consommé ; un refresh déjà utilisé révoque toute la famille. */
  async refresh(
    raw: string | undefined,
  ): Promise<{ user: AuthUser; tokens: SessionTokens }> {
    const unauthorized = new UnauthorizedException({
      message: 'Session expirée',
      code: 'INVALID_REFRESH',
    });
    if (!raw) throw unauthorized;
    const token = await this.tokens.consume(raw, 'REFRESH');
    if (!token) {
      const known = await this.tokens.findByRaw(raw);
      if (known && known.type === 'REFRESH' && known.usedAt) {
        await this.tokens.revokeAll(known.userId, 'REFRESH');
      }
      throw unauthorized;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: token.userId },
    });
    if (!user) throw unauthorized;
    await this.assertCanSignIn(user);
    return { user: toAuthUser(user), tokens: await this.issueSession(user.id) };
  }

  async logout(raw: string | undefined): Promise<void> {
    if (raw) await this.tokens.consume(raw, 'REFRESH');
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || user.status !== 'ACTIVE') return;
    const raw = await this.tokens.issue(user.id, 'PASSWORD_RESET', {
      revokePrevious: true,
    });
    await this.mail.send(
      this.templates.passwordReset(user.email, user.fullName, raw),
    );
  }

  async resetPassword(raw: string, password: string): Promise<void> {
    const token = await this.tokens.consume(raw, 'PASSWORD_RESET');
    if (!token) throw new BadRequestException(INVALID_TOKEN);
    await this.prisma.user.update({
      where: { id: token.userId },
      data: { passwordHash: await hashPassword(password) },
    });
    await this.tokens.revokeAll(token.userId, 'REFRESH');
  }

  async acceptInvite(raw: string, password: string): Promise<void> {
    const token = await this.tokens.consume(raw, 'INVITE');
    if (!token) throw new BadRequestException(INVALID_TOKEN);
    await this.prisma.user.update({
      where: { id: token.userId },
      data: {
        passwordHash: await hashPassword(password),
        emailVerifiedAt: new Date(),
      },
    });
  }

  async me(user: AuthUser) {
    const membership = await this.prisma.companyMember.findFirst({
      where: { userId: user.id },
      include: { company: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      user,
      company: membership
        ? {
            id: membership.company.id,
            legalName: membership.company.legalName,
            status: membership.company.status,
          }
        : null,
      membership: membership ? { role: membership.role } : null,
    };
  }
}
