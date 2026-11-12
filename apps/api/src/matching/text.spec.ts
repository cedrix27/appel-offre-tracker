import { normalizeText, SearchableText } from './text';

describe('normalizeText', () => {
  it('passe en minuscules et retire les accents', () => {
    expect(normalizeText('Électrification RÉSEAU Œuvre')).toBe(
      'electrification reseau oeuvre',
    );
  });

  it('remplace la ponctuation et les apostrophes par des espaces', () => {
    expect(normalizeText("Château d'eau — Koudougou, (lot 2)")).toBe(
      'chateau d eau koudougou lot 2',
    );
  });

  it('gère null et chaînes vides', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText('   ')).toBe('');
  });
});

describe('SearchableText', () => {
  const text = new SearchableText([
    'Acquisition de matériels informatiques',
    "Travaux d'adduction d'eau potable à Kaya",
  ]);

  it('trouve des mots entiers sans tenir compte des accents ni de la casse', () => {
    expect(text.contains('MATERIELS')).toBe(true);
    expect(text.contains('kaya')).toBe(true);
  });

  it('trouve des expressions', () => {
    expect(text.contains("adduction d'eau")).toBe(true);
    expect(text.contains('eau potable')).toBe(true);
  });

  it('ne trouve pas de fragments de mots', () => {
    expect(text.contains('informatique')).toBe(false); // « informatiques »
    expect(text.contains('eau pot')).toBe(false);
    expect(text.contains('quisition')).toBe(false);
    expect(text.contains('')).toBe(false);
  });
});
