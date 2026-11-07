import { AlertTriangle, Inbox, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingBlock({ rows = 3, className, label = "Chargement…" }: { rows?: number; className?: string; label?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)} role="status" aria-live="polite" data-testid="loading">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-2xl bg-segment" />
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Impossible de charger ces informations",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-testid="error-state"
      className={cn("flex flex-col items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft p-5 text-danger", className)}
    >
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="size-4" aria-hidden />
        {title}
      </p>
      {message && <p className="text-[13px]">{message}</p>}
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="bg-surface text-ink">
          <RotateCw aria-hidden />
          Réessayer
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  children,
  action,
  className,
  testId = "empty-state",
}: {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn("flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center", className)}
    >
      <span className="flex size-11 items-center justify-center rounded-xl bg-segment text-ink-3">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-[15px] font-semibold">{title}</p>
      {children && <div className="max-w-md text-[13px] text-ink-3">{children}</div>}
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 text-[26px] leading-tight tracking-[-0.03em] sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[13px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Panneau blanc à bordure fine (rayon 20). */
export function Panel({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-line bg-surface p-5", className)} {...props}>
      {children}
    </section>
  );
}
