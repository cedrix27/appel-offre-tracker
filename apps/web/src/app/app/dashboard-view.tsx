"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, Sparkles } from "lucide-react";
import { FavoriteButton } from "@/components/app/favorite-button";
import { OnboardingCard } from "@/components/app/onboarding-card";
import { useSession } from "@/components/app/session";
import { CollectionPanel } from "@/components/app/status";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { TenderCard, toCardData } from "@/components/tender-card";
import { buttonVariants } from "@/components/ui/button";
import { emptyListMessage } from "@/lib/collection";
import { formatInt } from "@/lib/format";
import type { CollectionState, DashboardSummary, TenderListItem, WatchPreference } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const KPIS: { key: keyof Pick<DashboardSummary, "newMatches24h" | "newMatches7d" | "openMatches" | "favorites">; label: string; hint: string }[] = [
  { key: "newMatches24h", label: "Nouvelles correspondances", hint: "dernières 24 h" },
  { key: "newMatches7d", label: "Nouvelles correspondances", hint: "7 derniers jours" },
  { key: "openMatches", label: "Opportunités ouvertes", hint: "date limite non dépassée" },
  { key: "favorites", label: "Favoris", hint: "annonces suivies" },
];

function TenderList({ items, empty, collection }: { items: TenderListItem[]; empty: string; collection: CollectionState | null }) {
  if (!items.length) {
    return (
      <EmptyState title={collection?.lastOutcome === "FAILED" ? "Liste à vérifier" : "Rien à afficher pour l'instant"}>
        {emptyListMessage(collection, empty)}
      </EmptyState>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((t) => (
        <li key={t.id}>
          <TenderCard tender={toCardData(t)} actions={<FavoriteButton tenderId={t.id} isFavorite={t.saved?.isFavorite ?? false} />} />
        </li>
      ))}
    </ul>
  );
}

export function DashboardView() {
  const { me } = useSession();
  const summary = useApi<DashboardSummary>("/dashboard/summary");
  const prefs = useApi<WatchPreference[]>("/watch-preferences");
  const s = summary.data;
  const noPreference = prefs.data ? prefs.data.length === 0 : s?.preferencesCount === 0;

  return (
    <>
      <PageHeader
        eyebrow={me.company?.legalName}
        title="Tableau de bord"
        description={`Bonjour ${me.user.fullName}. Voici les opportunités sélectionnées pour votre entreprise.`}
        actions={
          <Link href="/app/annonces" className={buttonVariants({ variant: "outline" })}>
            Toutes les annonces
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Link>
        }
      />

      {noPreference && <OnboardingCard />}

      {summary.error ? (
        <ErrorState className="mt-6" message={summary.error.message} onRetry={summary.reload} />
      ) : !s ? (
        <LoadingBlock rows={3} className="mt-6" />
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          <CollectionPanel collection={s.collection} />

          <section aria-label="Chiffres clés">
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpis">
              {KPIS.map((k) => (
                <div key={k.key} className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5" data-testid={`kpi-${k.key}`}>
                  <dt className="text-[12px] font-medium text-ink-3">
                    {k.label}
                    <span className="block text-[11px] font-normal text-ink-2">{k.hint}</span>
                  </dt>
                  <dd className="num-xl mt-2 text-[40px] leading-none sm:text-[48px]">{formatInt(s[k.key])}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="grid gap-8 lg:grid-cols-2">
            <section aria-labelledby="deadlines-title" data-testid="deadlines-soon">
              <h2 id="deadlines-title" className="mb-3 flex items-center gap-2 text-[17px]">
                <CalendarClock className="size-4.5 text-warning" aria-hidden />
                Échéances proches
              </h2>
              <TenderList
                items={s.deadlinesSoon}
                collection={s.collection}
                empty="Aucune de vos opportunités ouvertes n'arrive à échéance prochainement."
              />
            </section>
            <section aria-labelledby="recent-title" data-testid="recent-matches">
              <h2 id="recent-title" className="mb-3 flex items-center gap-2 text-[17px]">
                <Sparkles className="size-4.5 text-brand" aria-hidden />
                Opportunités récentes
              </h2>
              <TenderList
                items={s.recentMatches}
                collection={s.collection}
                empty={
                  noPreference
                    ? "Configurez votre veille pour recevoir des opportunités adaptées à votre entreprise."
                    : "Aucune nouvelle correspondance pour le moment avec vos critères actuels."
                }
              />
            </section>
          </div>
        </div>
      )}
    </>
  );
}
