"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, FileSearch, Search, SlidersHorizontal, X } from "lucide-react";
import { FavoriteButton } from "@/components/app/favorite-button";
import { FormAlert, FormField } from "@/components/form";
import { CheckboxField, NativeSelect } from "@/components/inputs";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { TenderCard, toCardData } from "@/components/tender-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatInt } from "@/lib/format";
import { sectorLabel } from "@/lib/labels";
import {
  DEFAULT_SEARCH,
  TENDER_PAGE_SIZE,
  activeFilterCount,
  parseTenderSearch,
  toApiQuery,
  toUrlQuery,
  totalPages,
  updateSearch,
  type TenderSearch,
} from "@/lib/tender-query";
import type { DashboardSummary, Paginated, TenderFiltersResponse, TenderListItem } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

function sectorOptions(sectors: TenderFiltersResponse["sectors"] | undefined) {
  return (sectors ?? []).map((s) => (typeof s === "string" ? { code: s, label: sectorLabel(s) } : s));
}

export function TendersView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = useMemo(() => parseTenderSearch(params), [params]);
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState(search.q);
  const [qSource, setQSource] = useState(search.q);
  if (qSource !== search.q) {
    // URL modifiée de l'extérieur (retour arrière, réinitialisation) : on resynchronise le champ.
    setQSource(search.q);
    setQ(search.q);
  }

  const list = useApi<Paginated<TenderListItem>>(`/tenders?${toApiQuery(search)}`);
  const filters = useApi<TenderFiltersResponse>("/tenders/filters");
  const summary = useApi<DashboardSummary>("/dashboard/summary");
  const collectionFailed = summary.data?.collection?.lastOutcome === "FAILED";

  function apply(patch: Partial<TenderSearch>) {
    const next = updateSearch(search, patch);
    const qs = toUrlQuery(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: "page" in patch });
  }

  const count = activeFilterCount(search);
  const data = list.data;
  const pages = data ? totalPages(data.total, data.pageSize || TENDER_PAGE_SIZE) : 1;
  const f = filters.data;

  return (
    <>
      <PageHeader
        eyebrow="Annonces"
        title={search.onlyMatched ? "Vos correspondances" : "Toutes les annonces"}
        description="Annonces collectées dans les publications officielles. Chaque fiche renvoie à sa source."
      />

      {collectionFailed && (
        <FormAlert tone="danger" className="mb-4" title="Collecte en échec">
          Les annonces du jour n&apos;ont pas pu être vérifiées. La liste ci-dessous reflète la dernière collecte réussie.
        </FormAlert>
      )}

      <div className="flex flex-col gap-3">
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: q.trim() });
          }}
        >
          <label htmlFor="tender-q" className="sr-only">
            Rechercher dans les annonces
          </label>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-2" aria-hidden />
            <Input
              id="tender-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Titre, organisme, référence, mot-clé…"
              className="pl-10"
              data-testid="tender-search"
            />
          </div>
          <Button type="submit">Rechercher</Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Annonces affichées" className="inline-flex rounded-[12px] border border-line bg-segment p-1">
            {[
              { value: true, label: "Correspondances" },
              { value: false, label: "Toutes les annonces" },
            ].map((o) => (
              <button
                key={String(o.value)}
                type="button"
                role="radio"
                aria-checked={search.onlyMatched === o.value}
                onClick={() => apply({ onlyMatched: o.value })}
                data-testid={o.value ? "only-matched" : "all-tenders"}
                className={cn(
                  "min-h-9 rounded-[9px] px-3 text-[13px] font-medium text-ink-3",
                  search.onlyMatched === o.value && "bg-surface text-ink ring-1 ring-line",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="tender-filters"
            className="lg:hidden"
            data-testid="toggle-filters"
          >
            <SlidersHorizontal aria-hidden />
            Filtres
            {count > 0 && <Badge variant="brand">{count}</Badge>}
          </Button>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <label htmlFor="tender-sort" className="text-[12px] text-ink-2">
              Trier par
            </label>
            <NativeSelect
              id="tender-sort"
              value={search.sort}
              onChange={(e) => apply({ sort: e.target.value as TenderSearch["sort"] })}
              className="w-44"
              data-testid="tender-sort"
            >
              <option value="relevance">Pertinence</option>
              <option value="deadline">Date limite</option>
              <option value="recent">Plus récentes</option>
            </NativeSelect>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside
          id="tender-filters"
          aria-label="Filtres"
          className={cn("min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-4 lg:flex lg:self-start", showFilters ? "flex" : "hidden")}
          data-testid="tender-filters"
        >
          <FormField id="f-sector" label="Secteur">
            <NativeSelect id="f-sector" value={search.sector} onChange={(e) => apply({ sector: e.target.value })}>
              <option value="">Tous les secteurs</option>
              {sectorOptions(f?.sectors).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="f-organization" label="Organisme">
            <NativeSelect id="f-organization" value={search.organization} onChange={(e) => apply({ organization: e.target.value })}>
              <option value="">Tous les organismes</option>
              {f?.organizations.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="f-region" label="Zone">
            <NativeSelect id="f-region" value={search.region} onChange={(e) => apply({ region: e.target.value })}>
              <option value="">Toutes les zones</option>
              {f?.locations.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="f-procedure" label="Type de procédure">
            <NativeSelect id="f-procedure" value={search.procedureType} onChange={(e) => apply({ procedureType: e.target.value })}>
              <option value="">Tous les types</option>
              {f?.procedureTypes.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="text-sm font-medium">Publication</legend>
            <div className="grid grid-cols-2 gap-2">
              <FormField id="f-from" label={<span className="text-[12px] font-normal text-ink-2">Du</span>}>
                <Input id="f-from" type="date" value={search.from} onChange={(e) => apply({ from: e.target.value })} />
              </FormField>
              <FormField id="f-to" label={<span className="text-[12px] font-normal text-ink-2">Au</span>}>
                <Input id="f-to" type="date" value={search.to} onChange={(e) => apply({ to: e.target.value })} />
              </FormField>
            </div>
          </fieldset>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="text-sm font-medium">Date limite</legend>
            <div className="grid grid-cols-2 gap-2">
              <FormField id="f-dfrom" label={<span className="text-[12px] font-normal text-ink-2">Du</span>}>
                <Input id="f-dfrom" type="date" value={search.deadlineFrom} onChange={(e) => apply({ deadlineFrom: e.target.value })} />
              </FormField>
              <FormField id="f-dto" label={<span className="text-[12px] font-normal text-ink-2">Au</span>}>
                <Input id="f-dto" type="date" value={search.deadlineTo} onChange={(e) => apply({ deadlineTo: e.target.value })} />
              </FormField>
            </div>
          </fieldset>
          <CheckboxField
            label="Inclure les annonces clôturées"
            checked={search.includeClosed}
            onChange={(e) => apply({ includeClosed: e.target.checked })}
            data-testid="include-closed"
          />
          {(count > 0 || search.q) && (
            <Button
              variant="ghost"
              onClick={() => apply({ ...DEFAULT_SEARCH, onlyMatched: search.onlyMatched, sort: search.sort })}
              data-testid="reset-filters"
            >
              <X aria-hidden />
              Réinitialiser les filtres
            </Button>
          )}
        </aside>

        <section aria-label="Résultats" className="min-w-0" aria-busy={list.loading}>
          {list.error ? (
            <ErrorState message={list.error.message} onRetry={list.reload} />
          ) : !data ? (
            <LoadingBlock rows={3} />
          ) : (
            <>
              <p className="mb-3 text-[13px] text-ink-3" aria-live="polite" data-testid="tender-total">
                {formatInt(data.total)} annonce{data.total > 1 ? "s" : ""}
                {list.loading && " · mise à jour…"}
              </p>
              {data.items.length === 0 ? (
                <EmptyState icon={FileSearch} title="Aucune annonce ne correspond à ces critères" testId="tenders-empty">
                  {collectionFailed ? (
                    <p>La dernière collecte a échoué : les annonces du jour n&apos;ont pas pu être vérifiées.</p>
                  ) : search.onlyMatched ? (
                    <p>
                      Essayez « Toutes les annonces », élargissez vos filtres ou ajustez vos préférences de veille.
                    </p>
                  ) : (
                    <p>Modifiez la recherche ou les filtres.</p>
                  )}
                </EmptyState>
              ) : (
                <ul className="flex flex-col gap-3" data-testid="tender-list">
                  {data.items.map((t) => (
                    <li key={t.id}>
                      <TenderCard
                        tender={toCardData(t)}
                        actions={<FavoriteButton tenderId={t.id} isFavorite={t.saved?.isFavorite ?? false} />}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {pages > 1 && (
                <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3" data-testid="pagination">
                  <Button variant="outline" disabled={search.page <= 1} onClick={() => apply({ page: search.page - 1 })}>
                    <ChevronLeft aria-hidden />
                    Précédente
                  </Button>
                  <span className="text-[13px] text-ink-3 tabular-nums">
                    Page {search.page} sur {pages}
                  </span>
                  <Button variant="outline" disabled={search.page >= pages} onClick={() => apply({ page: search.page + 1 })}>
                    Suivante
                    <ChevronRight aria-hidden />
                  </Button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
