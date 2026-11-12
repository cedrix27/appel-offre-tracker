import { dateInTimeZone, dateOnly, formatDateFr, toYmd } from './dates';

describe('dates', () => {
  it('calcule la date du jour dans le fuseau', () => {
    const d = new Date('2026-11-06T23:30:00Z');
    expect(dateInTimeZone(d, 'Africa/Ouagadougou')).toBe('2026-11-06');
    expect(dateInTimeZone(d, 'Europe/Paris')).toBe('2026-11-07');
  });

  it('aller-retour YYYY-MM-DD', () => {
    expect(toYmd(dateOnly('2026-10-21'))).toBe('2026-10-21');
    expect(toYmd(null)).toBeNull();
  });

  it('formate en français', () => {
    const d = new Date('2026-11-20T09:00:00Z');
    expect(formatDateFr(d, 'Africa/Ouagadougou', false)).toBe(
      '20 novembre 2026',
    );
    expect(formatDateFr(d, 'Africa/Ouagadougou', true)).toContain('09:00');
  });
});
