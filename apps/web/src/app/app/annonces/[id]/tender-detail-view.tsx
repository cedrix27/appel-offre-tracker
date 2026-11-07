"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, ExternalLink, FileText, Info } from "lucide-react";
import { FavoriteButton } from "@/components/app/favorite-button";
import { TrackingForm } from "@/components/app/tracking";
import { EmptyState, ErrorState, LoadingBlock, Panel } from "@/components/states";
import { ScorePill } from "@/components/tender-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  NOT_SPECIFIED,
  deadlineLabel,
  deadlineState,
  formatDate,
  formatDateTime,
  formatDeadline,
  formatFcfa,
  formatPages,
} from "@/lib/format";
import { TENDER_STATUS_LABELS, fieldLabel, sectorLabel } from "@/lib/labels";
import type { TenderDetail } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

function Value({ value }: { value: string | null | undefined }) {
  const missing = value == null || value === "" || value === NOT_SPECIFIED;
  return <span className={cn("break-words", missing ? "italic text-hint" : "font-medium")}>{missing ? NOT_SPECIFIED : value}</span>;
}

function Row({ label, value, uncertain }: { label: string; value: string | null | undefined; uncertain?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[11px] text-ink-2">
        {label}
        {uncertain && (
          <span className="inline-flex items-center gap-0.5 text-warning">
            <AlertTriangle className="size-3" aria-hidden />
            incertain
          </span>
        )}
      </dt>
      <dd className="text-[13px]">
        <Value value={value} />
      </dd>
    </div>
  );
}

function ListOrMissing({ items, testId }: { items: string[] | null | undefined; testId?: string }) {
  if (!items?.length) return <p className="text-[13px] italic text-hint" data-testid={testId}>{NOT_SPECIFIED}</p>;
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px]" data-testid={testId}>
      {items.map((i, idx) => (
        <li key={idx} className="break-words">
          {i}
        </li>
      ))}
    </ul>
  );
}

function normalizeField(f: string) {
  return f.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** Ajoute l'ancre #page= à un lien PDF quand la page de l'avis est connue. */
function pdfWithPage(url: string, pages: number[]) {
  if (!pages.length || url.includes("#") || !/\.pdf($|\?)/i.test(url)) return url;
  return `${url}#page=${Math.min(...pages)}`;
}

export function TenderDetailView({ id }: { id: string }) {
  const { data: t, error, reload, mutate } = useApi<TenderDetail>(`/tenders/${encodeURIComponent(id)}`);

  if (error?.statusCode === 404) {
    return (
      <EmptyState
        title="Annonce introuvable"
        testId="tender-not-found"
        action={
          <Link href="/app/annonces" className={buttonVariants({ variant: "outline" })}>
            Retour aux annonces
          </Link>
        }
      >
        Cette annonce n&apos;existe pas ou n&apos;est plus disponible.
      </EmptyState>
    );
  }
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!t) return <LoadingBlock rows={4} />;

  const uncertain = new Set(t.missingOrUncertainFields.map(normalizeField));
  const isUncertain = (field: string) => uncertain.has(field);
  const state = deadlineState(t.submissionDeadline, undefined, t.deadlineHasTime);
  const pages = formatPages(t.sourcePages);
  const officialUrl = t.publication?.fileUrl ?? t.sourceUrl;

  return (
    <article data-testid="tender-detail" className="flex flex-col gap-6">
      <Link href="/app/annonces" className="inline-flex min-h-11 items-center gap-1.5 self-start text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux annonces
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow break-words">{t.organization ?? "Organisme non précisé"}</p>
          <h1 className="mt-2 text-[24px] leading-tight tracking-[-0.03em] break-words sm:text-[28px]">{t.title}</h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {t.isNew && <Badge variant="brand">Nouveau</Badge>}
            <Badge variant={t.status === "CLOSED" || t.status === "CANCELLED" ? "neutral" : "outline"}>
              {TENDER_STATUS_LABELS[t.status] ?? t.status}
            </Badge>
            <Badge variant={state.kind === "soon" ? "warning" : state.kind === "open" ? "success" : "neutral"}>
              {deadlineLabel(state)}
            </Badge>
            {t.procedureType && <Badge variant="outline">{t.procedureType}</Badge>}
            {t.sectors.map((s) => (
              <Badge key={s} variant="outline">
                {sectorLabel(s)}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-3">
          {t.match && <ScorePill score={t.match.score} />}
          <FavoriteButton
            tenderId={t.id}
            isFavorite={t.saved?.isFavorite ?? false}
            withLabel
            onChange={(saved) => mutate((d) => (d ? { ...d, saved } : d))}
          />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel aria-labelledby="key-info">
            <h2 id="key-info" className="text-[16px]">Informations clés</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Row label="Date limite de dépôt" value={formatDeadline(t.submissionDeadline, t.deadlineHasTime)} uncertain={isUncertain("submission_deadline")} />
              <Row label="Montant prévisionnel" value={formatFcfa(t.estimatedBudget, t.budgetTaxBasis)} uncertain={isUncertain("estimated_budget")} />
              <Row label="Référence" value={t.reference} uncertain={isUncertain("reference")} />
              <Row label="Organisme" value={t.organization} uncertain={isUncertain("organization")} />
              <Row label="Type de procédure" value={t.procedureType} uncertain={isUncertain("procedure_type")} />
              <Row label="Lieu d'exécution" value={t.location} uncertain={isUncertain("location")} />
              <Row label="Date de publication" value={formatDate(t.publicationDate)} uncertain={isUncertain("publication_date")} />
              <Row label="Financement" value={t.fundingSource} uncertain={isUncertain("funding_source")} />
              <Row label="Catégorie (source)" value={t.categories.join(", ") || null} uncertain={isUncertain("categories")} />
            </dl>
          </Panel>

          <Panel aria-labelledby="summary-title">
            <h2 id="summary-title" className="text-[16px]">Résumé</h2>
            <p className="mt-2 text-[14px]">
              <Value value={t.summary} />
            </p>
            <h3 className="mt-5 text-[14px]">Objet / description</h3>
            <p className="mt-1 text-[14px] whitespace-pre-line text-ink-3">
              <Value value={t.description} />
            </p>
          </Panel>

          <Panel aria-labelledby="match-title" data-testid="match-panel">
            <h2 id="match-title" className="text-[16px]">Pertinence pour votre entreprise</h2>
            {t.match ? (
              <>
                <p className="mt-2 text-[14px]">
                  Score indicatif : <span className="num-xl text-[18px]">{t.match.score}/100</span>
                </p>
                {t.match.reasons.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2" data-testid="match-reasons">
                    {t.match.reasons.map((r) => (
                      <li key={r.code} className="flex items-start justify-between gap-3 rounded-[12px] bg-paper px-3 py-2 text-[13px]">
                        <span className="min-w-0">{r.label}</span>
                        <span className="shrink-0 font-semibold tabular-nums">+{r.points}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {t.match.matchedKeywords.length > 0 && (
                  <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2">
                    Mots-clés trouvés :
                    {t.match.matchedKeywords.map((k) => (
                      <Badge key={k} variant="brand">
                        {k}
                      </Badge>
                    ))}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-[13px] text-ink-3">Cette annonce ne correspond à aucune de vos préférences de veille actives.</p>
            )}
            <p className="mt-4 flex gap-2 rounded-[12px] border border-warning-line bg-warning-soft px-3 py-2.5 text-[12px] text-warning" data-testid="score-disclaimer">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Le score est indicatif et ne garantit ni l&apos;éligibilité ni le succès : consultez le dossier officiel.
            </p>
          </Panel>

          <Panel aria-labelledby="conditions-title">
            <h2 id="conditions-title" className="text-[16px]">Conditions de participation</h2>
            <div className="mt-2">
              <ListOrMissing items={t.eligibilityRequirements} testId="eligibility" />
            </div>
            <h2 className="mt-5 text-[16px]">Pièces requises</h2>
            <div className="mt-2">
              <ListOrMissing items={t.requiredDocuments} testId="required-documents" />
            </div>
          </Panel>

          <Panel aria-labelledby="docs-title">
            <h2 id="docs-title" className="text-[16px]">Documents</h2>
            {t.documents.length ? (
              <ul className="mt-2 flex flex-col">
                {t.documents.map((d) => (
                  <li key={d.url}>
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-brand-ink hover:underline">
                      <FileText className="size-4" aria-hidden />
                      <span className="break-all">{d.label || d.url}</span>
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-ink-3">Aucun document joint n&apos;est référencé : consultez la publication officielle.</p>
            )}
          </Panel>

          {t.missingOrUncertainFields.length > 0 && (
            <Panel aria-labelledby="uncertain-title" className="border-warning-line" data-testid="uncertain-fields">
              <h2 id="uncertain-title" className="flex items-center gap-2 text-[16px]">
                <AlertTriangle className="size-4 text-warning" aria-hidden />
                Champs absents ou incertains
              </h2>
              <p className="mt-1 text-[12px] text-ink-2">Ces informations n&apos;ont pas été trouvées ou sont ambiguës dans l&apos;avis : vérifiez-les dans la source.</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {t.missingOrUncertainFields.map((f) => (
                  <li key={f}>
                    <Badge variant="warning">{fieldLabel(f)}</Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel aria-labelledby="source-title" data-testid="official-source">
            <h2 id="source-title" className="text-[16px]">Source officielle</h2>
            <a
              href={pdfWithPage(officialUrl, t.sourcePages)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "brand", className: "mt-3 w-full whitespace-normal" })}
              data-testid="official-link"
            >
              Ouvrir la publication ({t.source.name}
              {pages ? `, ${pages}` : ""})
              <ExternalLink data-icon="inline-end" aria-hidden />
            </a>
            {t.publication?.pageUrl && (
              <a href={t.publication.pageUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-brand-ink hover:underline">
                Page de la publication
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
            <dl className="mt-3 grid gap-3">
              <Row label="Publication" value={t.publication ? `${t.publication.externalRef}${t.publication.publicationDate ? ` du ${formatDate(t.publication.publicationDate)}` : ""}` : null} />
              <Row label="Pages de l'avis" value={pages || null} />
              <Row label="Collectée le" value={formatDateTime(t.collectedAt)} />
              <Row label="Dernière vérification" value={formatDateTime(t.lastVerifiedAt)} />
            </dl>
          </Panel>

          <Panel aria-labelledby="tracking-title">
            <h2 id="tracking-title" className="text-[16px]">Suivi</h2>
            <div className="mt-3">
              <TrackingForm
                tenderId={t.id}
                status={t.saved?.status ?? null}
                note={t.note}
                onSaved={({ status, note }) =>
                  mutate((d) => (d ? { ...d, note, saved: { isFavorite: d.saved?.isFavorite ?? false, status } } : d))
                }
              />
            </div>
          </Panel>
        </aside>
      </div>
    </article>
  );
}
