/** Normalisation pour le matching : minuscules, sans accents, ponctuation → espaces. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Texte normalisé prêt pour une recherche par mots entiers. */
export class SearchableText {
  private readonly padded: string;

  constructor(parts: (string | null | undefined)[]) {
    this.padded = ` ${parts.map(normalizeText).filter(Boolean).join(' ')} `;
  }

  /** Vrai si le mot ou l'expression apparaît en mots entiers. */
  contains(term: string): boolean {
    const needle = normalizeText(term);
    if (!needle) return false;
    return this.padded.includes(` ${needle} `);
  }
}
