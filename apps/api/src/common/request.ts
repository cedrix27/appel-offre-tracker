import type { Request } from 'express';
import type { GlobalRole, MemberRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  globalRole: GlobalRole;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  companyId?: string;
  memberRole?: MemberRole;
}
