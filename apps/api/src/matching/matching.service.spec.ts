import { effectiveDeadline, isTenderOpen } from './matching.service';

describe('isTenderOpen (D27)', () => {
  const now = new Date('2026-11-20T15:00:00Z');

  it('date limite sans heure : ouverte toute la journée', () => {
    const t = {
      status: 'NEW' as const,
      submissionDeadline: new Date('2026-11-20T00:00:00Z'),
      deadlineHasTime: false,
    };
    expect(isTenderOpen(t, now)).toBe(true);
    expect(effectiveDeadline(t)?.toISOString()).toBe(
      '2026-11-21T00:00:00.000Z',
    );
    expect(isTenderOpen(t, new Date('2026-11-21T00:00:01Z'))).toBe(false);
  });

  it('date limite avec heure : close après l’heure', () => {
    const t = {
      status: 'NEW' as const,
      submissionDeadline: new Date('2026-11-20T09:00:00Z'),
      deadlineHasTime: true,
    };
    expect(isTenderOpen(t, now)).toBe(false);
  });

  it('statuts clôturés et date absente', () => {
    expect(
      isTenderOpen(
        {
          status: 'CANCELLED',
          submissionDeadline: null,
          deadlineHasTime: false,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isTenderOpen(
        { status: 'UPDATED', submissionDeadline: null, deadlineHasTime: false },
        now,
      ),
    ).toBe(true);
  });
});
