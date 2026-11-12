import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC } from '../decorators';
import type { AppRequest } from '../request';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

interface AccessPayload {
  sub: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const cookies = req.cookies as
      Record<string, string | undefined> | undefined;
    const token = cookies?.[ACCESS_COOKIE];
    if (!token) throw new UnauthorizedException('Authentification requise');

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token);
    } catch {
      throw new UnauthorizedException({
        message: 'Session expirée',
        code: 'TOKEN_EXPIRED',
      });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException('Authentification requise');
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException({
        message: 'Compte suspendu',
        code: 'ACCOUNT_SUSPENDED',
      });
    }
    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      globalRole: user.globalRole,
    };
    return true;
  }
}
