import { serializeBigInt } from './bigint.interceptor';

describe('serializeBigInt', () => {
  it('convertit les BigInt imbriqués et conserve les dates', () => {
    const d = new Date('2026-11-07T07:00:00Z');
    expect(
      serializeBigInt({ a: 12_500_000n, b: [1n, { c: 2n }], d, e: null }),
    ).toEqual({ a: 12_500_000, b: [1, { c: 2 }], d, e: null });
  });
});
