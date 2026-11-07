import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  NOT_SPECIFIED,
  deadlineLabel,
  deadlineState,
  formatDeadline,
  formatFcfa,
  scoreLevel,
} from "@/lib/format";

/** Vue d'affichage d'un appel d'offres. Tous les champs extraits sont nullables. */
export type TenderCardData = {
  organization: string | null;
  title: string;
  reference: string | null;
  procedureType: string | null;
  category: string | null;
  submissionDeadline: string | null;
  deadlineHasTime?: boolean;
  estimatedBudget: number | null;
  budgetTaxBasis?: "HT" | "HTVA" | "TTC" | null;
  source: { name: string; url: string; pages?: number[] };
  score?: number | null;
  isNew?: boolean;
};

function Field({ label, value }: { label: string; value: string }) {
  const missing = value === NOT_SPECIFIED;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-2">{label}</dt>
      <dd className={cn("text-[13px] font-medium break-words", missing && "font-normal italic text-hint")}>{value}</dd>
    </div>
  );
}

export function TenderCard({
  tender,
  now,
  className,
  style,
}: {
  tender: TenderCardData;
  now?: Date;
  className?: string;
  style?: React.CSSProperties;
}) {
  const state = deadlineState(tender.submissionDeadline, now);
  const level = tender.score != null ? scoreLevel(tender.score) : null;
  const pages = tender.source.pages?.length ? `, p. ${tender.source.pages.join("–")}` : "";

  return (
    <article style={style} className={cn("flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-5", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow truncate">{tender.organization ?? "Organisme non précisé"}</p>
          <h3 className="mt-1.5 text-[16px] leading-snug">{tender.title}</h3>
        </div>
        {tender.score != null && level && (
          <div
            className={cn(
              "flex shrink-0 flex-col items-center rounded-xl border px-2.5 py-1.5",
              level === "high" && "border-success-line bg-success-soft text-success",
              level === "medium" && "border-warning-line bg-warning-soft text-warning",
              level === "low" && "border-line bg-segment text-ink-3",
            )}
          >
            <span className="num-xl text-[20px] leading-none">{tender.score}</span>
            <span className="text-[10px] font-medium">/100</span>
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-1.5">
        {tender.isNew && <Badge variant="brand">Nouveau</Badge>}
        <Badge
          variant={
            state.kind === "soon" ? "warning" : state.kind === "closed" ? "neutral" : state.kind === "open" ? "success" : "neutral"
          }
        >
          {deadlineLabel(state)}
        </Badge>
        {tender.procedureType && <Badge variant="outline">{tender.procedureType}</Badge>}
        {tender.category && <Badge variant="outline">{tender.category}</Badge>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Date limite" value={formatDeadline(tender.submissionDeadline, tender.deadlineHasTime ?? true)} />
        <Field label="Montant prévisionnel" value={formatFcfa(tender.estimatedBudget, tender.budgetTaxBasis)} />
        <Field label="Référence" value={tender.reference ?? NOT_SPECIFIED} />
        <Field label="Source" value={tender.source.name} />
      </dl>

      <a
        href={tender.source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-[13px] font-medium text-brand-ink underline-offset-4 hover:underline"
      >
        Publication officielle ({tender.source.name}
        {pages})
        <ExternalLink className="size-3.5" aria-hidden />
      </a>
    </article>
  );
}
