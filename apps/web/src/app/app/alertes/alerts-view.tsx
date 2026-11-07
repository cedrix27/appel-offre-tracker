"use client";

import { BellRing } from "lucide-react";
import { NotificationBadge } from "@/components/app/status";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { formatDate, formatDateTime, formatInt } from "@/lib/format";
import type { NotificationItem } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function AlertsView() {
  const { data, error, loading, reload } = useApi<NotificationItem[]>("/notifications");

  return (
    <>
      <PageHeader
        eyebrow="Alertes"
        title="Historique des alertes"
        description="Chaque matin, un récapitulatif est envoyé s'il existe de nouvelles annonces correspondant à votre veille."
      />
      {error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingBlock rows={3} />
      ) : !data?.length ? (
        <EmptyState icon={BellRing} title="Aucune alerte pour l'instant" testId="alerts-empty">
          Le premier récapitulatif sera envoyé après la prochaine collecte, si des annonces correspondent à votre veille.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="alerts-list">
          {data.map((n) => (
            <li key={n.id} className="rounded-2xl border border-line bg-surface p-5" data-testid="alert-row">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="eyebrow">Récapitulatif du {formatDate(n.digestDate)}</p>
                  <p className="mt-1 font-semibold break-words">{n.subject ?? "Récapitulatif quotidien"}</p>
                </div>
                <NotificationBadge status={n.status} />
              </div>
              <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] text-ink-2">Annonces</dt>
                  <dd className="font-semibold tabular-nums">{formatInt(n.tenderCount)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-2">Envoyé le</dt>
                  <dd className={n.sentAt ? "font-medium" : "italic text-hint"}>{n.sentAt ? formatDateTime(n.sentAt) : "Non envoyé"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] text-ink-2">Destinataires</dt>
                  <dd className="break-words">{n.recipients.length ? n.recipients.join(", ") : <span className="italic text-hint">Aucun</span>}</dd>
                </div>
              </dl>
              {n.error && (
                <p className="mt-3 rounded-[12px] bg-danger-soft px-3 py-2 text-[12px] text-danger" role="note">
                  Erreur : {n.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
