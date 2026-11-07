import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Champ de formulaire : libellé, aide, message d'erreur relié par aria-describedby. */
export function FormField({
  id,
  label,
  hint,
  error,
  className,
  labelAside,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  labelAside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[12px] text-ink-2">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-[12px] text-danger">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

/** Props ARIA à poser sur l'input d'un FormField. */
export function fieldAria(id: string, error?: string, hasHint = false) {
  const describedBy = error ? `${id}-error` : hasHint ? `${id}-hint` : undefined;
  return { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy } as const;
}

type Tone = "danger" | "success" | "info" | "warning";

const TONE_CLASSES: Record<Tone, string> = {
  danger: "border-danger/30 bg-danger-soft text-danger",
  success: "border-success-line bg-success-soft text-success",
  info: "border-line bg-paper text-ink",
  warning: "border-warning-line bg-warning-soft text-warning",
};

const TONE_ICONS = { danger: AlertTriangle, success: CheckCircle2, info: Info, warning: AlertTriangle };

/** Message de formulaire ou de page : toujours une icône et un texte (couleur jamais seule). */
export function FormAlert({
  tone = "info",
  title,
  children,
  className,
  testId,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const Icon = TONE_ICONS[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      data-testid={testId}
      className={cn("flex gap-3 rounded-[12px] border px-3.5 py-3 text-[13px]", TONE_CLASSES[tone], className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-[13px] [&_a]:underline")}>{children}</div>}
      </div>
    </div>
  );
}
