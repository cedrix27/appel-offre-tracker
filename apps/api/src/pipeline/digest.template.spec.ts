import {
  buildDigestEmail,
  DigestTender,
  unspecifiedFields,
} from './digest.template';

const tender = (over: Partial<DigestTender> = {}): DigestTender => ({
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Acquisition de matériel informatique',
  reference: 'DPX-12/2026',
  organization: 'Ministère de la Santé',
  description: 'Fourniture d’ordinateurs.',
  summary: 'Achat de 40 ordinateurs portables.',
  location: 'Ouagadougou',
  procedureType: 'Demande de prix',
  submissionDeadline: new Date('2026-11-20T09:00:00Z'),
  deadlineHasTime: true,
  estimatedBudget: 25_000_000n,
  budgetTaxBasis: 'TTC',
  sourceUrl: 'https://www.dgcmef.gov.bf/files/q4514.pdf',
  sourceName: 'DGCMEF',
  missingOrUncertainFields: [],
  score: 75,
  reasons: [
    {
      code: 'SECTOR',
      label: 'Secteur surveillé : Informatique & télécoms',
      points: 35,
    },
  ],
  ...over,
});

const base = {
  companyName: 'Entreprise <A>',
  digestDate: '2026-11-07',
  generatedAt: new Date('2026-11-07T07:05:00Z'),
  timeZone: 'Africa/Ouagadougou',
  webAppUrl: 'http://localhost:3000',
  recipients: ['a@example.com'],
  failedSources: [] as string[],
};

describe('buildDigestEmail', () => {
  it('contient date, nombre, champs, score, raisons et liens', () => {
    const mail = buildDigestEmail({ ...base, tenders: [tender()] });
    expect(mail.subject).toBe(
      'SRC Digital — 1 nouvelle annonce correspondante (07 novembre 2026)',
    );
    expect(mail.category).toBe('DAILY_DIGEST');
    expect(mail.html).toContain('Votre veille du 07 novembre 2026');
    expect(mail.html).toContain('Entreprise &lt;A&gt;');
    expect(mail.html).toContain('Ministère de la Santé');
    expect(mail.html).toContain('20 novembre 2026');
    expect(mail.html).toContain('Score indicatif : 75/100');
    expect(mail.html).toContain(
      'Secteur surveillé : Informatique &amp; télécoms',
    );
    expect(mail.html).toContain(
      'http://localhost:3000/app/annonces/11111111-1111-1111-1111-111111111111',
    );
    expect(mail.html).toContain('https://www.dgcmef.gov.bf/files/q4514.pdf');
    expect(mail.html).not.toContain('collecte n’a pas pu être effectuée');
    expect(mail.text).toContain('Date limite : 20 novembre 2026');
  });

  it('affiche « Non précisé » pour les champs absents, sans rien inventer', () => {
    const mail = buildDigestEmail({
      ...base,
      tenders: [
        tender({
          organization: null,
          submissionDeadline: null,
          estimatedBudget: null,
          summary: null,
          missingOrUncertainFields: ['funding_source'],
        }),
      ],
    });
    expect(mail.text).toContain('Organisme : Non précisé');
    expect(mail.text).toContain('Date limite : Non précisé');
    expect(mail.text).toContain('Budget : Non précisé');
    expect(mail.text).toContain(
      'Champs non précisés : Organisme, Date limite, Budget, Source de financement',
    );
  });

  it('affiche le bandeau d’échec de collecte', () => {
    const mail = buildDigestEmail({
      ...base,
      tenders: [tender()],
      failedSources: ['DGCMEF'],
    });
    expect(mail.html).toContain('la collecte n’a pas pu être effectuée');
    expect(mail.text).toContain(
      "Il ne s'agit pas d'une journée sans appel d'offres",
    );
  });
});

describe('unspecifiedFields', () => {
  it('signale l’heure limite manquante', () => {
    expect(unspecifiedFields(tender({ deadlineHasTime: false }))).toEqual([
      'Heure limite',
    ]);
  });
});
