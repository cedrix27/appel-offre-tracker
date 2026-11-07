"use client";

import { useId, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Liste déroulante native (accessible et fiable sur Android), au style des inputs. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <select
        className="h-11 w-full min-w-0 appearance-none truncate rounded-[12px] border border-input bg-surface py-1 pr-9 pl-3.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive md:text-sm"
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-2" aria-hidden />
    </div>
  );
}

/** Case à cocher native stylée, cible 44 px via le libellé. */
export function CheckboxField({
  label,
  description,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { label: React.ReactNode; description?: React.ReactNode }) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-[12px] border border-line bg-surface px-3 py-2.5 text-[13px] has-checked:border-ink has-checked:bg-paper has-disabled:cursor-not-allowed has-disabled:opacity-60",
        className,
      )}
    >
      <input type="checkbox" className="mt-0.5 size-4.5 shrink-0 accent-ink" {...props} />
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        {description && <span className="block text-[12px] text-ink-2">{description}</span>}
      </span>
    </label>
  );
}

/**
 * Saisie de « tags » (mots-clés, zones, e-mails) : Entrée, virgule ou bouton « Ajouter ».
 * `suggestions` alimente une datalist ; `validate` renvoie un message d'erreur ou null.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  suggestions,
  validate,
  disabled,
  invalid,
  describedBy,
  tone = "neutral",
  testId,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  validate?: (v: string) => string | null;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  tone?: "neutral" | "danger";
  testId?: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  function add(raw: string) {
    const parts = raw
      .split(/[,;\n]/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) {
      const err = validate?.(p) ?? null;
      if (err) {
        setError(err);
        setDraft(p);
        return;
      }
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    setError(null);
    setDraft("");
    onChange(next);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid={testId}>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Éléments ajoutés">
          {value.map((v) => (
            <li
              key={v}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-0.5 pl-3 text-[12px] font-medium",
                tone === "danger" ? "border-danger/30 bg-danger-soft text-danger" : "border-line bg-segment text-ink",
              )}
            >
              <span className="truncate">{v}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x !== v))}
                  className="relative flex size-6 items-center justify-center rounded-full hover:bg-ink/10 after:absolute after:-inset-2"
                  aria-label={`Retirer « ${v} »`}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <Input
            id={id}
            value={draft}
            list={suggestions?.length ? listId : undefined}
            placeholder={placeholder}
            aria-invalid={invalid || error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => {
              const v = e.target.value;
              if (/[,;]$/.test(v)) add(v);
              else {
                setDraft(v);
                setError(null);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
              } else if (e.key === "Backspace" && !draft && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
            onBlur={() => draft.trim() && add(draft)}
          />
          <Button type="button" variant="outline" onClick={() => add(draft)} aria-label="Ajouter" className="shrink-0">
            <Plus aria-hidden />
            <span className="hidden sm:inline">Ajouter</span>
          </Button>
          {suggestions?.length ? (
            <datalist id={listId}>
              {suggestions
                .filter((s) => !value.includes(s))
                .map((s) => (
                  <option key={s} value={s} />
                ))}
            </datalist>
          ) : null}
        </div>
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}
