import {
  bestMatch,
  formatFcfa,
  PreferenceForMatch,
  scoreTender,
  TenderForMatch,
} from './matching.engine';

const tender = (over: Partial<TenderForMatch> = {}): TenderForMatch => ({
  title: 'Acquisition de matériel informatique au profit de la DGI',
  description:
    'Fourniture d’ordinateurs portables, d’imprimantes et d’onduleurs.',
  summary: null,
  sectors: ['informatique'],
  procedureType: 'Demande de prix',
  location: 'Ouagadougou',
  estimatedBudget: 25_000_000n,
  ...over,
});

const pref = (over: Partial<PreferenceForMatch> = {}): PreferenceForMatch => ({
  id: 'p1',
  sectors: [],
  keywordsInclude: [],
  keywordsExclude: [],
  procedureTypes: [],
  regions: [],
  budgetMin: null,
  budgetMax: null,
  minScore: 0,
  ...over,
});

describe('scoreTender — barème PLAN §7', () => {
  it('secteur commun = 35 points, critères non filtrés = zone 10 + budget 10 + procédure 5', () => {
    const res = scoreTender(tender(), pref({ sectors: ['informatique'] }));
    expect(res).not.toBeNull();
    expect(res!.score).toBe(35 + 10 + 10 + 5);
    expect(res!.reasons.map((r) => r.code)).toEqual([
      'SECTOR',
      'REGION',
      'BUDGET',
      'PROCEDURE',
    ]);
    expect(res!.reasons[0].label).toBe(
      'Secteur surveillé : Informatique & télécoms',
    );
  });

  it('mots-clés : 40 × trouvés / total', () => {
    const res = scoreTender(
      tender({ sectors: [] }),
      pref({
        keywordsInclude: [
          'ordinateurs',
          'imprimantes',
          'serveur',
          'fibre optique',
        ],
      }),
    );
    const kw = res!.reasons.find((r) => r.code === 'KEYWORDS')!;
    expect(kw.points).toBe(20);
    expect(res!.matchedKeywords).toEqual(['ordinateurs', 'imprimantes']);
    expect(kw.label).toBe('Mots-clés trouvés (2/4) : ordinateurs, imprimantes');
  });

  it('mots-clés : minimum 15 points dès qu’un mot est trouvé', () => {
    const res = scoreTender(
      tender({ sectors: [] }),
      pref({
        keywordsInclude: [
          'onduleurs',
          'a',
          'b',
          'c',
          'd',
          'e',
          'f',
          'g',
          'h',
          'i',
        ],
      }),
    );
    expect(res!.reasons.find((r) => r.code === 'KEYWORDS')!.points).toBe(15);
  });

  it('ignore les accents et la casse, en mots entiers', () => {
    const t = tender({
      sectors: [],
      title: 'Travaux d’ÉLECTRIFICATION rurale',
    });
    expect(
      scoreTender(t, pref({ keywordsInclude: ['electrification'] })),
    ).not.toBeNull();
    expect(scoreTender(t, pref({ keywordsInclude: ['électrifi'] }))).toBeNull();
  });

  it('expressions de plusieurs mots', () => {
    const t = tender({
      sectors: [],
      description: "Réalisation d'un château d'eau à Kaya",
    });
    const res = scoreTender(t, pref({ keywordsInclude: ["château d'eau"] }));
    expect(res!.matchedKeywords).toEqual(["château d'eau"]);
  });

  it('une exclusion trouvée rejette l’annonce, même avec secteur et mots-clés', () => {
    const res = scoreTender(
      tender(),
      pref({
        sectors: ['informatique'],
        keywordsInclude: ['ordinateurs'],
        keywordsExclude: ['Imprimantes'],
      }),
    );
    expect(res).toBeNull();
  });

  it('exige au moins un secteur ou un mot-clé', () => {
    expect(scoreTender(tender(), pref({ sectors: ['btp'] }))).toBeNull();
    expect(scoreTender(tender(), pref())).toBeNull();
  });

  it('zone : 10 si correspondance, 5 si lieu absent, 0 sinon', () => {
    const p = pref({ sectors: ['informatique'], regions: ['Ouagadougou'] });
    const pts = (t: TenderForMatch) =>
      scoreTender(t, p)!.reasons.find((r) => r.code === 'REGION')?.points ?? 0;
    expect(pts(tender({ location: 'Commune de Ouagadougou' }))).toBe(10);
    expect(pts(tender({ location: null }))).toBe(5);
    expect(pts(tender({ location: 'Bobo-Dioulasso' }))).toBe(0);
    expect(pts(tender({ location: 'National' }))).toBe(10);
  });

  it('budget : 10 dans la fourchette, 5 si non publié, 0 hors fourchette', () => {
    const p = pref({
      sectors: ['informatique'],
      budgetMin: 10_000_000n,
      budgetMax: 30_000_000n,
    });
    const pts = (t: TenderForMatch) =>
      scoreTender(t, p)!.reasons.find((r) => r.code === 'BUDGET')?.points ?? 0;
    expect(pts(tender())).toBe(10);
    expect(pts(tender({ estimatedBudget: null }))).toBe(5);
    expect(pts(tender({ estimatedBudget: 50_000_000n }))).toBe(0);
    expect(
      scoreTender(tender(), p)!.reasons.find((r) => r.code === 'BUDGET')!.label,
    ).toBe('Budget dans votre fourchette (25 000 000 FCFA)');
  });

  it('procédure : 5 si correspondance ou si aucun filtre, 0 sinon', () => {
    const pts = (p: PreferenceForMatch, t = tender()) =>
      scoreTender(t, p)!.reasons.find((r) => r.code === 'PROCEDURE')?.points ??
      0;
    expect(pts(pref({ sectors: ['informatique'] }))).toBe(5);
    expect(
      pts(
        pref({
          sectors: ['informatique'],
          procedureTypes: ['Demande de prix'],
        }),
      ),
    ).toBe(5);
    expect(
      pts(
        pref({
          sectors: ['informatique'],
          procedureTypes: ["Appel d'offres ouvert"],
        }),
      ),
    ).toBe(0);
    expect(
      pts(
        pref({
          sectors: ['informatique'],
          procedureTypes: ['Demande de prix'],
        }),
        tender({ procedureType: null }),
      ),
    ).toBe(0);
  });

  it('score maximal = 100', () => {
    const res = scoreTender(
      tender(),
      pref({
        sectors: ['informatique'],
        keywordsInclude: ['ordinateurs'],
        regions: ['Ouagadougou'],
        budgetMin: 1n,
        procedureTypes: ['Demande de prix'],
      }),
    );
    expect(res!.score).toBe(100);
  });

  it('respecte le seuil minScore', () => {
    expect(
      scoreTender(tender(), pref({ sectors: ['informatique'], minScore: 61 })),
    ).toBeNull();
    expect(
      scoreTender(tender(), pref({ sectors: ['informatique'], minScore: 60 }))!
        .score,
    ).toBe(60);
  });
});

describe('bestMatch', () => {
  it('conserve la meilleure préférence', () => {
    const res = bestMatch(tender(), [
      pref({ id: 'faible', sectors: ['informatique'], regions: ['Kaya'] }),
      pref({
        id: 'forte',
        sectors: ['informatique'],
        keywordsInclude: ['onduleurs'],
      }),
      pref({
        id: 'exclue',
        sectors: ['informatique'],
        keywordsExclude: ['ordinateurs'],
      }),
    ]);
    expect(res!.preferenceId).toBe('forte');
    expect(res!.score).toBe(100);
  });

  it('renvoie null si aucune préférence ne correspond', () => {
    expect(bestMatch(tender(), [pref({ sectors: ['sante'] })])).toBeNull();
    expect(bestMatch(tender(), [])).toBeNull();
  });
});

describe('formatFcfa', () => {
  it('formate en français', () => {
    expect(formatFcfa(12_500_000)).toBe('12 500 000 FCFA');
  });
});
