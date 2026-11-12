import { Injectable } from '@nestjs/common';
import { AuthToken, AuthTokenType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateRawToken, hashToken, TOKEN_TTL_MS } from './tokens';

/** Jetons opaques à usage unique, stockés hachés (SHA-256) dans auth_tokens. */
@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    userId: string,
    type: AuthTokenType,
    opts: { revokePrevious?: boolean } = {},
  ): Promise<string> {
    const raw = generateRawToken();
    const now = new Date();
    if (opts.revokePrevious) {
      await this.revokeAll(userId, type);
    }
    await this.prisma.authToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(raw),
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[type]),
      },
    });
    return raw;
  }

  /** Consomme atomiquement un jeton valide (non utilisé, non expiré). */
  async consume(raw: string, type: AuthTokenType): Promise<AuthToken | null> {
    const tokenHash = hashToken(raw);
    const now = new Date();
    const res = await this.prisma.authToken.updateMany({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (res.count !== 1) return null;
    return this.prisma.authToken.findUnique({ where: { tokenHash } });
  }

  findByRaw(raw: string): Promise<AuthToken | null> {
    return this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(raw) },
    });
  }

  async revokeAll(userId: string, type: AuthTokenType): Promise<void> {
    await this.prisma.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
  }
}
