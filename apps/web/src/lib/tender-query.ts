/**
 * Filtres de la liste d'annonces : lecture depuis l'URL, écriture dans l'URL (valeurs par défaut omises)
 * et construction de la query string de `GET /tenders` (PLAN.md §5).
 */

import type { SavedStatus, TenderSort } from "./types";

export const TENDER_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export type TenderSearch = {
  q: string;
  sector: string;
  organization: string;
  region: string;
  procedureType: string;
  /** Période de publication (YYYY-MM-DD). */
  from: string;
  to: string;
  /** Période d'échéance (YYYY-MM-DD). */
  deadlineFrom: string;
  deadlineTo: string;
  onlyMatched: boolean;
  includeClosed: boolean;
  favorite: boolean;
  savedStatus: SavedStatus | "";
  sort: TenderSort;
  page: number;
};

export const DEFAULT_SEARCH: TenderSearch = {
  q: "",
  sector: "",
  organization: "",
  region: "",
  procedureType: "",
  from: "",
  to: "",
  deadlineFrom: "",
  deadlineTo: "",
  onlyMatched: true,
  includeClosed: false,
  favorite: false,
  savedStatus: "",
  sort: "relevance",
  page: 1,
};

const TEXT_KEYS = ["q", "sector", "organization", "region", "procedureType"] as const;
const DATE_KEYS = ["from", "to", "deadlineFrom", "deadlineTo"] as const;
const SORTS: TenderSort[] = ["relevance", "deadline", "recent"];
const SAVED: SavedStatus[] = ["TO_REVIEW", "INTERESTED", "APPLYING", "IGNORED"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ParamsLike = { get(name: string): string | null };

function bool(value: string | null, fallback: boolean): boolean {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

/** URL → filtres (valeurs invalides ignorées). */
export function parseTenderSearch(params: ParamsLike): TenderSearch {
  const s: TenderSearch = { ...DEFAULT_SEARCH };
  for (const k of TEXT_KEYS) s[k] = (params.get(k) ?? "").trim().slice(0, 200);
  for (const k of DATE_KEYS) {
    const v = params.get(k) ?? "";
    s[k] = DATE_RE.test(v) ? v : "";
  }
  s.onlyMatched = bool(params.get("onlyMatched"), DEFAULT_SEARCH.onlyMatched);
  s.includeClosed = bool(params.get("includeClosed"), DEFAULT_SEARCH.includeClosed);
  s.favorite = bool(params.get("favorite"), false);
  const status = params.get("savedStatus") as SavedStatus | null;
  s.savedStatus = status && SAVED.includes(status) ? status : "";
  const sort = params.get("sort") as TenderSort | null;
  s.sort = sort && SORTS.includes(sort) ? sort : DEFAULT_SEARCH.sort;
  const page = Number.parseInt(params.get("page") ?? "", 10);
  s.page = Number.isFinite(page) && page > 0 ? page : 1;
  return s;
}

function entries(s: TenderSearch, includeDefaults: boolean): [string, string][] {
  const out: [string, string][] = [];
  for (const k of [...TEXT_KEYS, ...DATE_KEYS]) {
    const v = s[k].trim();
    if (v) out.push([k, v]);
  }
  if (includeDefaults || s.onlyMatched !== DEFAULT_SEARCH.onlyMatched) out.push(["onlyMatched", String(s.onlyMatched)]);
  if (includeDefaults || s.includeClosed !== DEFAULT_SEARCH.includeClosed)
    out.push(["includeClosed", String(s.includeClosed)]);
  if (s.favorite) out.push(["favorite", "true"]);
  if (s.savedStatus) out.push(["savedStatus", s.savedStatus]);
  if (includeDefaults || s.sort !== DEFAULT_SEARCH.sort) out.push(["sort", s.sort]);
  if (includeDefaults || s.page !== 1) out.push(["page", String(s.page)]);
  return out;
}

/** Filtres → query string de la page (sans « ? », valeurs par défaut omises). */
export function toUrlQuery(s: TenderSearch): string {
  return new URLSearchParams(entries(s, false)).toString();
}

/** Filtres → query string de `GET /tenders` (booléens et tri toujours explicites). */
export function toApiQuery(s: TenderSearch, pageSize = TENDER_PAGE_SIZE): string {
  const p = new URLSearchParams(entries(s, true));
  p.set("pageSize", String(Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE)));
  return p.toString();
}

/** Applique une modification de filtre ; tout changement autre que la page revient en page 1. */
export function updateSearch(s: TenderSearch, patch: Partial<TenderSearch>): TenderSearch {
  const next = { ...s, ...patch };
  if (!("page" in patch)) next.page = 1;
  return next;
}

/** Nombre de filtres actifs (hors recherche, tri et page) pour le badge du bouton « Filtres ». */
export function activeFilterCount(s: TenderSearch): number {
  let n = 0;
  for (const k of ["sector", "organization", "region", "procedureType", ...DATE_KEYS] as const) if (s[k]) n++;
  if (s.includeClosed) n++;
  if (!s.onlyMatched) n++;
  return n;
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}
