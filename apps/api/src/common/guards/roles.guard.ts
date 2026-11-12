import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppRole, ROLES } from '../decorators';
import type { AppRequest } from '../request';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AppRole[] | undefined>(
      ROLES,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!roles || roles.length === 0) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const ok = roles.some((role) =>
      role === 'SUPER_ADMIN'
        ? req.user?.globalRole === 'SUPER_ADMIN'
        : req.memberRole === role,
    );
    if (!ok) {
      throw new ForbiddenException({
        message: 'Droits insuffisants',
        code: 'FORBIDDEN',
      });
    }
    return true;
  }
}
