import { sectorLabel } from '../reference/taxonomy';
import { normalizeText, SearchableText } from './text';

export interface MatchReason {
  code: 'SECTOR' | 'KEYWORDS' | 'REGION' | 'BUDGET' | 'PROCEDURE';
  label: string;
  points: number;
}

export interface TenderForMatch {
  title: string;
  description: string | null;
  summary: string | null;
  sectors: string[];
  procedureType: string | null;
  location: string | null;
  estimatedBudget: bigint | number | null;
}

export interface PreferenceForMatch {
  id: string;
  sectors: string[];
  keywordsInclude: string[];
  keywordsExclude: string[];
  procedureTypes: string[];
  regions: string[];
  budgetMin: bigint | number | null;
  budgetMax: bigint | number | null;
  minScore: number;
}

export interface MatchResult {
  preferenceId: string;
  score: number;
  reasons: MatchReason[];
  matchedKeywords: string[];
}

export const POINTS = {
  sector: 35,
  keywords: 40,
  keywordsMin: 15,
  region: 10,
  regionUnknown: 5,
  budget: 10,
  budgetUnknown: 5,
  procedure: 5,
} as const;

const fcfa = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
export function formatFcfa(value: bigint | number): string {
  return `${fcfa.format(Number(value)).replace(/\s/g, ' ')} FCFA`;
}

/** Score d'une annonce pour une préférence (PLAN §7). null = rejet ou sous le seuil. */
export function scoreTender(
  tender: TenderForMatch,
  pref: PreferenceForMatch,
): MatchResult | null {
  const text = new SearchableText([
    tender.title,
    tender.description,
    tender.summary,
  ]);

  // 1. Exclusions : un seul mot exclu trouvé → rejet.
  if (pref.keywordsExclude.some((kw) => text.contains(kw))) return null;

  const reasons: MatchReason[] = [];

  // 2. Secteurs communs.
  const commonSectors = pref.sectors.filter((s) => tender.sectors.includes(s));
  if (commonSectors.length > 0) {
    reasons.push({
      code: 'SECTOR',
      label: `Secteur surveillé : ${commonSectors.map(sectorLabel).join(', ')}`,
      points: POINTS.sector,
    });
  }

  // 3. Mots-clés inclus (titre / objet / description).
  const keywords = uniqueTerms(pref.keywordsInclude);
  const found = keywords.filter((kw) => text.contains(kw));
  if (found.length > 0) {
    const points = Math.max(
      POINTS.keywordsMin,
      Math.round((POINTS.keywords * found.length) / keywords.length),
    );
    reasons.push({
      code: 'KEYWORDS',
      label: `Mots-clés trouvés (${found.length}/${keywords.length}) : ${found.join(', ')}`,
      points: Math.min(points, POINTS.keywords),
    });
  }

  if (commonSectors.length === 0 && found.length === 0) return null;

  // 4. Zone.
  const region = regionReason(tender.location, pref.regions);
  if (region) reasons.push(region);

  // 5. Budget.
  const budget = budgetReason(
    tender.estimatedBudget,
    pref.budgetMin,
    pref.budgetMax,
  );
  if (budget) reasons.push(budget);

  // 6. Procédure.
  if (pref.procedureTypes.length === 0) {
    reasons.push({
      code: 'PROCEDURE',
      label: 'Tous types de procédure acceptés',
      points: POINTS.procedure,
    });
  } else if (
    tender.procedureType &&
    pref.procedureTypes.some(
      (p) => normalizeText(p) === normalizeText(tender.procedureType),
    )
  ) {
    reasons.push({
      code: 'PROCEDURE',
      label: `Procédure : ${tender.procedureType}`,
      points: POINTS.procedure,
    });
  }

  const score = Math.min(
    100,
    reasons.reduce((sum, r) => sum + r.points, 0),
  );
  if (score < pref.minScore) return null;
  return { preferenceId: pref.id, score, reasons, matchedKeywords: found };
}

function uniqueTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    const key = normalizeText(t);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(t.trim());
    }
  }
  return out;
}

function regionReason(
  location: string | null,
  regions: string[],
): MatchReason | null {
  if (regions.length === 0) {
    return {
      code: 'REGION',
      label: 'Toutes zones acceptées',
      points: POINTS.region,
    };
  }
  if (!location || !normalizeText(location)) {
    return {
      code: 'REGION',
      label: 'Lieu d’exécution non précisé',
      points: POINTS.regionUnknown,
    };
  }
  const loc = new SearchableText([location]);
  const national =
    regions.some((r) => normalizeText(r) === 'national') ||
    loc.contains('national');
  const hit = regions.find((r) => loc.contains(r));
  if (hit || national) {
    return {
      code: 'REGION',
      label: `Zone d’intervention : ${location}`,
      points: POINTS.region,
    };
  }
  return null;
}

function budgetReason(
  budget: bigint | number | null,
  min: bigint | number | null,
  max: bigint | number | null,
): MatchReason | null {
  if (min === null && max === null) {
    return {
      code: 'BUDGET',
      label: 'Aucune fourchette de budget définie',
      points: POINTS.budget,
    };
  }
  if (budget === null) {
    return {
      code: 'BUDGET',
      label: 'Budget non publié',
      points: POINTS.budgetUnknown,
    };
  }
  const value = Number(budget);
  if (
    (min === null || value >= Number(min)) &&
    (max === null || value <= Number(max))
  ) {
    return {
      code: 'BUDGET',
      label: `Budget dans votre fourchette (${formatFcfa(value)})`,
      points: POINTS.budget,
    };
  }
  return null;
}

/** Meilleur résultat parmi les préférences actives. */
export function bestMatch(
  tender: TenderForMatch,
  prefs: PreferenceForMatch[],
): MatchResult | null {
  let best: MatchResult | null = null;
  for (const pref of prefs) {
    const res = scoreTender(tender, pref);
    if (res && (!best || res.score > best.score)) best = res;
  }
  return best;
}
