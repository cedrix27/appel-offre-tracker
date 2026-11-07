import { AlertTriangle, CheckCircle2, CircleDashed, CircleMinus, Clock, Loader2, MailCheck, MailX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { collectionSentence } from "@/lib/collection";
import { formatDate } from "@/lib/format";
import { NOTIFICATION_STATUS_LABELS, RUN_OUTCOME_LABELS } from "@/lib/labels";
import type { CollectionState, NotificationStatus, RunOutcome } from "@/lib/types";
import { cn } from "@/lib/utils";

const OUTCOME_STYLE: Record<RunOutcome, { variant: "success" | "neutral" | "danger" | "warning"; icon: typeof CheckCircle2 }> = {
  SUCCESS_NEW: { variant: "success", icon: CheckCircle2 },
  SUCCESS_NONE: { variant: "neutral", icon: CircleMinus },
  FAILED: { variant: "danger", icon: AlertTriangle },
  RUNNING: { variant: "warning", icon: Loader2 },
};

/** Badge d'issue de collecte : icône + libellé distincts pour chacun des 3 états (+ en cours). */
export function OutcomeBadge({ outcome }: { outcome: RunOutcome | null | undefined }) {
  if (!outcome) {
    return (
      <Badge variant="neutral" data-testid="outcome" data-outcome="NONE">
        <CircleDashed aria-hidden />
        Aucune collecte
      </Badge>
    );
  }
  const { variant, icon: Icon } = OUTCOME_STYLE[outcome];
  return (
    <Badge variant={variant} data-testid="outcome" data-outcome={outcome}>
      <Icon aria-hidden />
      {RUN_OUTCOME_LABELS[outcome]}
    </Badge>
  );
}

const NOTIF_STYLE: Record<NotificationStatus, { variant: "success" | "neutral" | "danger" | "warning"; icon: typeof MailCheck }> = {
  SENT: { variant: "success", icon: MailCheck },
  QUEUED: { variant: "warning", icon: Clock },
  FAILED: { variant: "danger", icon: MailX },
  SKIPPED: { variant: "neutral", icon: CircleMinus },
};

export function NotificationBadge({ status }: { status: NotificationStatus }) {
  const s = NOTIF_STYLE[status] ?? NOTIF_STYLE.QUEUED;
  return (
    <Badge variant={s.variant} data-testid="notification-status" data-status={status}>
      <s.icon aria-hidden />
      {NOTIFICATION_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

/** Encadré d'état de la collecte (tableau de bord). */
export function CollectionPanel({ collection, className }: { collection: CollectionState | null | undefined; className?: string }) {
  const { title, detail } = collectionSentence(collection);
  const outcome = collection?.lastOutcome ?? null;
  const failed = outcome === "FAILED";
  const Icon = outcome ? OUTCOME_STYLE[outcome].icon : CircleDashed;
  return (
    <section
      aria-label="État de la collecte"
      data-testid="collection-status"
      data-outcome={outcome ?? "NONE"}
      className={cn(
        "flex min-w-0 gap-3 rounded-2xl border p-5",
        failed ? "border-danger/30 bg-danger-soft" : outcome === "SUCCESS_NEW" ? "border-success-line bg-success-soft" : "border-line bg-surface",
        className,
      )}
    >
      <Icon
        className={cn("mt-0.5 size-5 shrink-0", failed ? "text-danger" : outcome === "SUCCESS_NEW" ? "text-success" : "text-ink-3")}
        aria-hidden
      />
      <div className="min-w-0 text-[13px]">
        <p className="eyebrow">Collecte {collection?.sourceName ? `· ${collection.sourceName}` : ""}</p>
        <p className={cn("mt-1 text-[15px] font-semibold", failed && "text-danger")}>{title}</p>
        {detail && <p className="mt-1 text-ink-3">{detail}</p>}
        <p className="mt-2 text-ink-3">
          Dernière publication source :{" "}
          {collection?.latestPublicationRef ? (
            <span className="font-medium text-ink">
              {collection.latestPublicationRef}
              {collection.latestPublicationDate ? ` du ${formatDate(collection.latestPublicationDate)}` : ""}
            </span>
          ) : (
            <span className="italic text-hint">Non précisé</span>
          )}
        </p>
      </div>
    </section>
  );
}
