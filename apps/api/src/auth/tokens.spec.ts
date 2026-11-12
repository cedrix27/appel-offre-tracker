import { generateRawToken, hashToken, TOKEN_TTL_MS } from './tokens';

describe('jetons', () => {
  it('génère des jetons aléatoires longs et distincts', () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hache en SHA-256 hexadécimal, de façon déterministe', () => {
    const raw = 'jeton-de-test';
    expect(hashToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(hashToken(raw)).not.toContain(raw);
  });

  it('respecte les durées de validité', () => {
    expect(TOKEN_TTL_MS.EMAIL_VERIFY).toBe(48 * 3600 * 1000);
    expect(TOKEN_TTL_MS.PASSWORD_RESET).toBe(3600 * 1000);
    expect(TOKEN_TTL_MS.INVITE).toBe(7 * 24 * 3600 * 1000);
    expect(TOKEN_TTL_MS.REFRESH).toBe(30 * 24 * 3600 * 1000);
  });
});
