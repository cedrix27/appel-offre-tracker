import { createHash, randomBytes } from 'node:crypto';

export function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export const TOKEN_TTL_MS = {
  EMAIL_VERIFY: 48 * 3600 * 1000,
  PASSWORD_RESET: 3600 * 1000,
  INVITE: 7 * 24 * 3600 * 1000,
  REFRESH: 30 * 24 * 3600 * 1000,
} as const;
