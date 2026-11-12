import { formatDateFr } from '../common/dates';
import { COLORS, escapeHtml, layout, paragraph } from '../mail/layout';
import type { MailMessage } from '../mail/mail.types';
import { formatFcfa, MatchReason } from '../matching/matching.engine';

export const NOT_SPECIFIED = 'Non précisé';

export interface DigestTender {
  id: string;
  title: string;
  reference: string | null;
  organization: string | null;
  description: string | null;
  summary: string | null;
  location: string | null;
  procedureType: string | null;
  submissionDeadline: Date | null;
  deadlineHasTime: boolean;
  estimatedBudget: bigint | number | null;
  budgetTaxBasis: string | null;
  sourceUrl: string;
  sourceName: string;
  missingOrUncertainFields: string[];
  score: number;
  reasons: MatchReason[];
}

export interface DigestInput {
  companyName: string;
  digestDate: string; // YYYY-MM-DD
  generatedAt: Date;
  timeZone: string;
  webAppUrl: string;
  tenders: DigestTender[];
  failedSources: string[];
  recipients: string[];
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Intitulé',
  reference: 'Référence',
  organization: 'Organisme',
  description: 'Objet',
  categories: 'Catégorie',
  location: 'Lieu d’exécution',
  publication_date: 'Date de publication',
  publicationDate: 'Date de publication',
  submission_deadline: 'Date limite',
  submissionDeadline: 'Date limite',
  submission_time: 'Heure limite',
  submissionTime: 'Heure limite',
  estimated_budget: 'Budget',
  estimatedBudget: 'Budget',
  procedure_type: 'Type de procédure',
  procedureType: 'Type de procédure',
  funding_source: 'Source de financement',
  fundingSource: 'Source de financement',
  eligibility_requirements: 'Conditions de participation',
  eligibilityRequirements: 'Conditions de participation',
  required_documents: 'Pièces requises',
  requiredDocuments: 'Pièces requises',
  summary: 'Résumé',
};

/** Champs absents ou incertains, en libellés français dédoublonnés. */
export function unspecifiedFields(t: DigestTender): string[] {
  const keys: string[] = [];
  if (!t.reference) keys.push('reference');
  if (!t.organization) keys.push('organization');
  if (!t.description) keys.push('description');
  if (!t.location) keys.push('location');
  if (!t.procedureType) keys.push('procedure_type');
  if (!t.submissionDeadline) keys.push('submission_deadline');
  else if (!t.deadlineHasTime) keys.push('submission_time');
  if (t.estimatedBudget === null) keys.push('estimated_budget');
  keys.push(...t.missingOrUncertainFields);
  return [...new Set(keys.map((k) => FIELD_LABELS[k] ?? k))];
}

export function formatDeadline(t: DigestTender, timeZone: string): string {
  if (!t.submissionDeadline) return NOT_SPECIFIED;
  const value = formatDateFr(t.submissionDeadline, timeZone, t.deadlineHasTime);
  return t.deadlineHasTime ? value : `${value} (heure non précisée)`;
}

export function formatBudget(t: DigestTender): string {
  if (t.estimatedBudget === null) return NOT_SPECIFIED;
  return `${formatFcfa(t.estimatedBudget)}${t.budgetTaxBasis ? ` ${t.budgetTaxBasis}` : ''}`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

export function digestSubject(
  input: Pick<DigestInput, 'tenders' | 'digestDate' | 'timeZone'>,
): string {
  const n = input.tenders.length;
  const date = formatDateFr(
    new Date(`${input.digestDate}T12:00:00Z`),
    input.timeZone,
    false,
  );
  return `SRC Digital — ${n} nouvelle${n > 1 ? 's' : ''} annonce${n > 1 ? 's' : ''} correspondante${n > 1 ? 's' : ''} (${date})`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:2px 12px 2px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${COLORS.ink2};vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:2px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${COLORS.ink};vertical-align:top">${escapeHtml(value)}</td></tr>`;
}

export function buildDigestEmail(input: DigestInput): MailMessage {
  const ficheUrl = (id: string) =>
    new URL(`/app/annonces/${id}`, input.webAppUrl).toString();
  const dateLabel = formatDateFr(
    new Date(`${input.digestDate}T12:00:00Z`),
    input.timeZone,
    false,
  );
  const generated = formatDateFr(input.generatedAt, input.timeZone, true);
  const n = input.tenders.length;
  const subject = digestSubject(input);

  const banner = input.failedSources.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><td style="background:${COLORS.warnBg};border-left:4px solid ${COLORS.brand};padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${COLORS.ink}"><strong>Attention : la collecte n’a pas pu être effectuée</strong> pour ${escapeHtml(input.failedSources.join(', '))}. Les annonces de cette source publiées depuis la dernière collecte réussie ne figurent peut-être pas dans ce récapitulatif. Il ne s’agit pas d’une journée sans appel d’offres : nous relancerons la collecte dès que possible.</td></tr></table>`
    : '';

  const cards = input.tenders
    .map((t) => {
      const missing = unspecifiedFields(t);
      const reasons = t.reasons
        .map((r) => `${r.label} (+${r.points})`)
        .join(' · ');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border:1px solid ${COLORS.line};border-radius:10px"><tr><td style="padding:16px">
<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;line-height:1.35;color:${COLORS.ink}">${escapeHtml(t.title)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px">
${row('Organisme', t.organization ?? NOT_SPECIFIED)}
${row('Référence', t.reference ?? NOT_SPECIFIED)}
${row('Objet', t.description ? truncate(t.description, 400) : NOT_SPECIFIED)}
${row('Date limite', formatDeadline(t, input.timeZone))}
${row('Lieu', t.location ?? NOT_SPECIFIED)}
${row('Budget', formatBudget(t))}
${row('Source', t.sourceName)}
</table>
<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${COLORS.ink}"><strong>Résumé :</strong> ${escapeHtml(t.summary ?? NOT_SPECIFIED)}</p>
<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${COLORS.ink}"><strong style="color:${COLORS.brand}">Score indicatif : ${t.score}/100</strong> — ${escapeHtml(reasons || NOT_SPECIFIED)}</p>
${missing.length ? `<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${COLORS.ink2}">Champs non précisés dans la source : ${escapeHtml(missing.join(', '))}</p>` : ''}
<p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px"><a href="${escapeHtml(ficheUrl(t.id))}" style="display:inline-block;padding:10px 16px;margin:0 8px 8px 0;background:${COLORS.ink};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold">Voir la fiche</a><a href="${escapeHtml(t.sourceUrl)}" style="display:inline-block;padding:10px 16px;margin:0 0 8px;border:1px solid ${COLORS.ink};color:${COLORS.ink};text-decoration:none;border-radius:8px">Source officielle</a></p>
</td></tr></table>`;
    })
    .join('\n');

  const html = layout({
    preheader: `${n} nouvelle(s) annonce(s) pour ${input.companyName}.`,
    title: `Votre veille du ${dateLabel}`,
    body:
      banner +
      paragraph(
        `<strong>${n}</strong> nouvelle${n > 1 ? 's' : ''} annonce${n > 1 ? 's' : ''} correspond${n > 1 ? 'ent' : ''} aux critères de veille de <strong>${escapeHtml(input.companyName)}</strong>.`,
      ) +
      cards +
      `<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${COLORS.ink2}">Généré le ${escapeHtml(generated)}. Le score est indicatif : il ne garantit ni l’éligibilité ni le succès. Consultez toujours le dossier officiel avant de candidater. « ${NOT_SPECIFIED} » signifie que la source ne fournit pas l’information.</p>`,
  });

  const textCards = input.tenders
    .map((t, i) => {
      const missing = unspecifiedFields(t);
      return [
        `${i + 1}. ${t.title}`,
        `   Organisme : ${t.organization ?? NOT_SPECIFIED}`,
        `   Référence : ${t.reference ?? NOT_SPECIFIED}`,
        `   Objet : ${t.description ? truncate(t.description, 400) : NOT_SPECIFIED}`,
        `   Date limite : ${formatDeadline(t, input.timeZone)}`,
        `   Budget : ${formatBudget(t)}`,
        `   Résumé : ${t.summary ?? NOT_SPECIFIED}`,
        `   Score indicatif : ${t.score}/100 — ${t.reasons.map((r) => r.label).join(' ; ')}`,
        missing.length
          ? `   Champs non précisés : ${missing.join(', ')}`
          : null,
        `   Fiche : ${ficheUrl(t.id)}`,
        `   Source officielle (${t.sourceName}) : ${t.sourceUrl}`,
      ]
        .filter((l): l is string => l !== null)
        .join('\n');
    })
    .join('\n\n');

  const text = [
    `Votre veille du ${dateLabel} — ${input.companyName}`,
    input.failedSources.length
      ? `\nATTENTION : la collecte n'a pas pu être effectuée pour ${input.failedSources.join(', ')}. Il ne s'agit pas d'une journée sans appel d'offres.\n`
      : '',
    `${n} nouvelle(s) annonce(s) correspondante(s).\n`,
    textCards,
    `\nGénéré le ${generated}. Score indicatif, sans garantie d'éligibilité : consultez le dossier officiel.`,
  ].join('\n');

  return {
    to: input.recipients,
    subject,
    html,
    text,
    category: 'DAILY_DIGEST',
  };
}
