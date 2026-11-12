import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { AppRequest, AuthUser } from '../request';

export const IS_PUBLIC = 'isPublic';
/** Route accessible sans session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
export type AppRole = 'SUPER_ADMIN' | 'COMPANY_ADMIN';
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES, roles);

export const AUTH_RATE_LIMITED = 'authRateLimited';
/** Applique le limiteur « auth » (login, register, forgot…). */
export const AuthRateLimited = () => SetMetadata(AUTH_RATE_LIMITED, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw new UnauthorizedException();
    return req.user;
  },
);

/** companyId issu exclusivement de la session (CompanyMemberGuard). */
export const CompanyId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.companyId) throw new ForbiddenException();
    return req.companyId;
  },
);
