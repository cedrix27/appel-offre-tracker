"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Star } from "lucide-react";
import { FavoriteButton } from "@/components/app/favorite-button";
import { StatusSelect } from "@/components/app/tracking";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { TenderCard, toCardData } from "@/components/tender-card";
import { buttonVariants } from "@/components/ui/button";
import { SAVED_STATUSES, SAVED_STATUS_LABELS } from "@/lib/labels";
import { DEFAULT_SEARCH, toApiQuery } from "@/lib/tender-query";
import type { Paginated, SavedStatus, TenderListItem } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type View = "favoris" | SavedStatus;

const VIEWS: { value: View; label: string }[] = [
  { value: "favoris", label: "Favoris" },
  ...SAVED_STATUSES.map((s) => ({ value: s as View, label: SAVED_STATUS_LABELS[s] })),
];

function parseView(v: string | null): View {
  return VIEWS.some((x) => x.value === v) ? (v as View) : "favoris";
}

export function TrackingView() {
  const view = parseView(useSearchParams().get("vue"));
  const query = toApiQuery(
    {
      ...DEFAULT_SEARCH,
      onlyMatched: false,
      includeClosed: true,
      sort: "deadline",
      favorite: view === "favoris",
      savedStatus: view === "favoris" ? "" : view,
    },
    50,
  );
  const { data, error, loading, reload, mutate } = useApi<Paginated<TenderListItem>>(`/tenders?${query}`);

  return (
    <>
      <PageHeader
        eyebrow="Suivi"
        title="Favoris & suivi"
        description="Retrouvez les annonces que vous suivez, classées par statut."
      />

      <nav aria-label="Vues du suivi" className="-mx-1 mb-5 flex flex-wrap gap-1.5" data-testid="tracking-tabs">
        {VIEWS.map((v) => (
          <Link
            key={v.value}
            href={v.value === "favoris" ? "/app/suivi" : `/app/suivi?vue=${v.value}`}
            aria-current={view === v.value ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-[13px] font-medium",
              view === v.value ? "border-ink bg-ink text-primary-foreground" : "border-line bg-surface text-ink-3 hover:text-ink",
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingBlock rows={2} />
      ) : !data?.items.length ? (
        <EmptyState
          icon={Star}
          title={view === "favoris" ? "Aucun favori" : `Aucune annonce « ${SAVED_STATUS_LABELS[view]} »`}
          testId="tracking-empty"
          action={
            <Link href="/app/annonces" className={buttonVariants({ variant: "outline" })}>
              Parcourir les annonces
            </Link>
          }
        >
          {view === "favoris"
            ? "Ajoutez une annonce à vos favoris avec l'étoile pour la retrouver ici."
            : "Changez le statut de suivi d'une annonce depuis sa fiche."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="tracking-list">
          {data.items.map((t) => (
            <li key={t.id}>
              <TenderCard
                tender={toCardData(t)}
                actions={
                  <>
                    <StatusSelect
                      tenderId={t.id}
                      status={t.saved?.status ?? "TO_REVIEW"}
                      onChange={(s) => {
                        if (view !== "favoris" && s !== view)
                          mutate((d) => (d ? { ...d, total: d.total - 1, items: d.items.filter((x) => x.id !== t.id) } : d));
                      }}
                    />
                    <FavoriteButton
                      tenderId={t.id}
                      isFavorite={t.saved?.isFavorite ?? false}
                      onChange={(saved) => {
                        if (view === "favoris" && !saved.isFavorite)
                          mutate((d) => (d ? { ...d, total: d.total - 1, items: d.items.filter((x) => x.id !== t.id) } : d));
                      }}
                    />
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
