import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEARCH,
  activeFilterCount,
  parseTenderSearch,
  toApiQuery,
  toUrlQuery,
  totalPages,
  updateSearch,
} from "./tender-query";

const params = (qs: string) => new URLSearchParams(qs);

describe("filtres d'annonces", () => {
  it("valeurs par défaut : correspondances seulement, sans clôturées, tri pertinence, page 1", () => {
    expect(parseTenderSearch(params(""))).toEqual(DEFAULT_SEARCH);
    expect(toUrlQuery(DEFAULT_SEARCH)).toBe("");
  });

  it("lit l'URL et ignore les valeurs invalides", () => {
    const s = parseTenderSearch(
      params("q=forage&sector=hydraulique&onlyMatched=false&includeClosed=true&sort=deadline&page=3&from=2026-10-01&to=pas-une-date&savedStatus=HACK"),
    );
    expect(s).toMatchObject({
      q: "forage",
      sector: "hydraulique",
      onlyMatched: false,
      includeClosed: true,
      sort: "deadline",
      page: 3,
      from: "2026-10-01",
      to: "",
      savedStatus: "",
    });
    expect(parseTenderSearch(params("sort=n%27importe&page=-2")).sort).toBe("relevance");
    expect(parseTenderSearch(params("page=-2")).page).toBe(1);
  });

  it("aller-retour URL ↔ filtres", () => {
    const s = { ...DEFAULT_SEARCH, q: "ordinateurs portables", organization: "BUMIGEB", onlyMatched: false, page: 2 };
    expect(parseTenderSearch(params(toUrlQuery(s)))).toEqual(s);
  });

  it("construit la query de GET /tenders avec booléens, tri, page et pageSize explicites", () => {
    const qs = toApiQuery({ ...DEFAULT_SEARCH, region: "Bobo-Dioulasso", deadlineFrom: "2026-11-01" });
    const p = new URLSearchParams(qs);
    expect(p.get("region")).toBe("Bobo-Dioulasso");
    expect(p.get("deadlineFrom")).toBe("2026-11-01");
    expect(p.get("onlyMatched")).toBe("true");
    expect(p.get("includeClosed")).toBe("false");
    expect(p.get("sort")).toBe("relevance");
    expect(p.get("page")).toBe("1");
    expect(p.get("pageSize")).toBe("20");
    expect(p.has("q")).toBe(false);
    expect(p.has("favorite")).toBe(false);
  });

  it("plafonne pageSize à 50 et transmet favoris / statut de suivi", () => {
    const p = new URLSearchParams(toApiQuery({ ...DEFAULT_SEARCH, favorite: true, savedStatus: "APPLYING" }, 500));
    expect(p.get("pageSize")).toBe("50");
    expect(p.get("favorite")).toBe("true");
    expect(p.get("savedStatus")).toBe("APPLYING");
  });

  it("revient en page 1 quand un filtre change, pas quand on pagine", () => {
    const s = { ...DEFAULT_SEARCH, page: 4 };
    expect(updateSearch(s, { sector: "btp" }).page).toBe(1);
    expect(updateSearch(s, { page: 5 }).page).toBe(5);
  });

  it("compte les filtres actifs et les pages", () => {
    expect(activeFilterCount(DEFAULT_SEARCH)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_SEARCH, sector: "btp", includeClosed: true, onlyMatched: false })).toBe(3);
    expect(totalPages(0, 20)).toBe(1);
    expect(totalPages(41, 20)).toBe(3);
  });
});
