import { likePattern } from './tenders.service';

describe('likePattern', () => {
  it('échappe les caractères spéciaux de LIKE', () => {
    expect(likePattern('100%_a\\b')).toBe('%100\\%\\_a\\\\b%');
    expect(likePattern('forage')).toBe('%forage%');
  });
});
