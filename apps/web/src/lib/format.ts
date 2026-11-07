/**
 * Formatage d'affichage. Règle produit : une donnée absente n'est jamais
 * inventée ni déduite — elle s'affiche « Non précisé ».
 */

export const NOT_SPECIFIED = "Non précisé";
export const TIMEZONE = "Africa/Ouagadougou";

const fcfa = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** 82600000 → « 82 600 000 FCFA » ; null → « Non précisé ». */
export function formatFcfa(amount: number | null | undefined, taxBasis?: "HT" | "HTVA" | "TTC" | null): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return NOT_SPECIFIED;
  // Intl utilise des espaces fines insécables ; on normalise en espace insécable simple.
  const n = fcfa.format(amount).replace(/[  ]/g, " ");
  return taxBasis ? `${n} FCFA ${taxBasis}` : `${n} FCFA`;
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date seule, affichée à l'heure du Burkina Faso. */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : NOT_SPECIFIED;
}

/** Date limite : « 30 octobre 2026 à 09:00 ». L'heure n'est affichée que si elle est connue. */
export function formatDeadline(value: string | Date | null | undefined, hasTime = true): string {
  const d = toDate(value);
  if (!d) return NOT_SPECIFIED;
  return hasTime ? `${dateFmt.format(d)} à ${timeFmt.format(d)}` : dateFmt.format(d);
}

export type DeadlineState =
  | { kind: "unknown" }
  | { kind: "closed" }
  | { kind: "soon"; days: number }
  | { kind: "open"; days: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/** État d'échéance. « soon » = 7 jours ou moins. Ouagadougou = UTC, pas d'heure d'été. */
export function deadlineState(value: string | Date | null | undefined, now: Date = new Date()): DeadlineState {
  const d = toDate(value);
  if (!d) return { kind: "unknown" };
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return { kind: "closed" };
  const days = Math.floor(diff / DAY_MS);
  return days <= 7 ? { kind: "soon", days } : { kind: "open", days };
}

export function deadlineLabel(state: DeadlineState): string {
  switch (state.kind) {
    case "unknown":
      return "Date limite non précisée";
    case "closed":
      return "Clôturé";
    case "soon":
      return state.days === 0 ? "Clôture aujourd'hui" : `Clôture dans ${state.days} j`;
    case "open":
      return `${state.days} jours restants`;
  }
}

export type ScoreLevel = "high" | "medium" | "low";

export function scoreLevel(score: number): ScoreLevel {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}
