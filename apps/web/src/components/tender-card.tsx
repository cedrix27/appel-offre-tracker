import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  NOT_SPECIFIED,
  deadlineLabel,
  deadlineState,
  formatDeadline,
  formatFcfa,
  formatPages,
  scoreLevel,
} from "@/lib/format";
import { SAVED_STATUS_LABELS, TENDER_STATUS_LABELS, sectorLabel } from "@/lib/labels";
import type { SavedStatus, TenderListItem, TenderStatus } from "@/lib/types";

/** Vue d'affichage d'un appel d'offres. Tous les champs extraits sont nullables. */
export type TenderCardData = {
  id?: string;
  organization: string | null;
  title: string;
  reference: string | null;
  procedureType: string | null;
  category: string | null;
  location?: string | null;
  submissionDeadline: string | null;
  deadlineHasTime?: boolean;
  estimatedBudget: number | null;
  budgetTaxBasis?: string | null;
  source: { name: string; url: string; pages?: number[] };
  score?: number | null;
  isNew?: boolean;
  status?: TenderStatus;
  savedStatus?: SavedStatus | null;
  /** Lien vers la fiche SaaS. */
  href?: string;
};

/** TenderListItem (API) → données de carte. */
export function toCardData(t: TenderListItem): TenderCardData {
  return {
    id: t.id,
    organization: t.organization,
    title: t.title,
    reference: t.reference,
    procedureType: t.procedureType,
    category: t.sectors.length ? t.sectors.map(sectorLabel).join(", ") : (t.categories[0] ?? null),
    location: t.location,
    submissionDeadline: t.submissionDeadline,
    deadlineHasTime: t.deadlineHasTime,
    estimatedBudget: t.estimatedBudget,
    budgetTaxBasis: t.budgetTaxBasis,
    source: { name: t.source.name, url: t.sourceUrl, pages: t.sourcePages },
    score: t.match?.score ?? null,
    isNew: t.isNew,
    status: t.status,
    savedStatus: t.saved?.status ?? null,
    href: `/app/annonces/${t.id}`,
  };
}

function Field({ label, value }: { label: string; value: string }) {
  const missing = value === NOT_SPECIFIED;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-2">{label}</dt>
      <dd className={cn("text-[13px] font-medium break-words", missing && "font-normal italic text-hint")}>{value}</dd>
    </div>
  );
}

export function ScorePill({ score, className }: { score: number; className?: string }) {
  const level = scoreLevel(score);
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center rounded-xl border px-2.5 py-1.5",
        level === "high" && "border-success-line bg-success-soft text-success",
        level === "medium" && "border-warning-line bg-warning-soft text-warning",
        level === "low" && "border-line bg-segment text-ink-3",
        className,
      )}
      aria-label={`Score de pertinence ${score} sur 100`}
      data-testid="score"
    >
      <span className="num-xl text-[20px] leading-none">{score}</span>
      <span className="text-[10px] font-medium">/100</span>
    </div>
  );
}

export function TenderCard({
  tender,
  now,
  className,
  style,
  actions,
}: {
  tender: TenderCardData;
  now?: Date;
  className?: string;
  style?: React.CSSProperties;
  /** Actions (favori…) rendues dans le pied de carte. */
  actions?: React.ReactNode;
}) {
  const state = deadlineState(tender.submissionDeadline, now, tender.deadlineHasTime ?? true);
  const closedStatus = tender.status === "CLOSED" || tender.status === "CANCELLED" || tender.status === "AWARDED";
  const pages = formatPages(tender.source.pages);

  return (
    <article
      style={style}
      data-testid="tender-card"
      className={cn("flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-5", className)}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow truncate">{tender.organization ?? "Organisme non précisé"}</p>
          <h3 className="mt-1.5 text-[16px] leading-snug break-words">
            {tender.href ? (
              <Link href={tender.href} className="hover:underline focus-visible:underline">
                {tender.title}
              </Link>
            ) : (
              tender.title
            )}
          </h3>
        </div>
        {tender.score != null && <ScorePill score={tender.score} />}
      </header>

      <div className="flex flex-wrap gap-1.5">
        {tender.isNew && <Badge variant="brand">Nouveau</Badge>}
        {closedStatus && tender.status ? (
          <Badge variant="neutral">{TENDER_STATUS_LABELS[tender.status]}</Badge>
        ) : (
          <Badge
            variant={
              state.kind === "soon" ? "warning" : state.kind === "open" ? "success" : "neutral"
            }
          >
            {deadlineLabel(state)}
          </Badge>
        )}
        {tender.savedStatus && <Badge variant="outline">{SAVED_STATUS_LABELS[tender.savedStatus]}</Badge>}
        {tender.procedureType && <Badge variant="outline">{tender.procedureType}</Badge>}
        {tender.category && (
          <Badge variant="outline" className="max-w-full truncate">
            {tender.category}
          </Badge>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Date limite" value={formatDeadline(tender.submissionDeadline, tender.deadlineHasTime ?? true)} />
        <Field label="Montant prévisionnel" value={formatFcfa(tender.estimatedBudget, tender.budgetTaxBasis)} />
        <Field label="Référence" value={tender.reference ?? NOT_SPECIFIED} />
        {tender.location !== undefined ? (
          <Field label="Lieu" value={tender.location ?? NOT_SPECIFIED} />
        ) : (
          <Field label="Source" value={tender.source.name} />
        )}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href={tender.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-brand-ink underline-offset-4 hover:underline"
        >
          Publication officielle ({tender.source.name}
          {pages ? `, ${pages}` : ""})
          <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">(nouvel onglet)</span>
        </a>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </article>
  );
}
