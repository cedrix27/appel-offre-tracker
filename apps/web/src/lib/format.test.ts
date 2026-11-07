import { describe, expect, it } from "vitest";
import {
  NOT_SPECIFIED,
  deadlineLabel,
  deadlineState,
  formatDeadline,
  formatFcfa,
  scoreLevel,
} from "./format";

describe("formatFcfa", () => {
  it("affiche « Non précisé » quand le montant est absent", () => {
    expect(formatFcfa(null)).toBe(NOT_SPECIFIED);
    expect(formatFcfa(undefined)).toBe(NOT_SPECIFIED);
    expect(formatFcfa(Number.NaN)).toBe(NOT_SPECIFIED);
  });

  it("formate en FCFA avec séparateurs français", () => {
    expect(formatFcfa(82_600_000, "TTC")).toBe("82 600 000 FCFA TTC");
    expect(formatFcfa(0)).toBe("0 FCFA");
  });
});

describe("formatDeadline", () => {
  it("n'invente jamais de date", () => {
    expect(formatDeadline(null)).toBe(NOT_SPECIFIED);
    expect(formatDeadline("pas une date")).toBe(NOT_SPECIFIED);
  });

  it("affiche l'heure de Ouagadougou (UTC)", () => {
    expect(formatDeadline("2026-10-30T09:00:00Z")).toBe("30 octobre 2026 à 09:00");
    expect(formatDeadline("2026-10-30T09:00:00Z", false)).toBe("30 octobre 2026");
  });
});

describe("deadlineState", () => {
  const now = new Date("2026-10-25T08:00:00Z");

  it("distingue inconnu, clôturé, proche et ouvert", () => {
    expect(deadlineState(null, now)).toEqual({ kind: "unknown" });
    expect(deadlineState("2026-10-20T09:00:00Z", now)).toEqual({ kind: "closed" });
    expect(deadlineState("2026-10-30T09:00:00Z", now)).toEqual({ kind: "soon", days: 5 });
    expect(deadlineState("2026-11-20T09:00:00Z", now)).toEqual({ kind: "open", days: 26 });
  });

  it("produit des libellés lisibles sans dépendre de la couleur", () => {
    expect(deadlineLabel({ kind: "unknown" })).toBe("Date limite non précisée");
    expect(deadlineLabel({ kind: "soon", days: 0 })).toBe("Clôture aujourd'hui");
    expect(deadlineLabel({ kind: "soon", days: 3 })).toBe("Clôture dans 3 j");
  });
});

describe("scoreLevel", () => {
  it("applique les seuils 75 / 50", () => {
    expect(scoreLevel(82)).toBe("high");
    expect(scoreLevel(75)).toBe("high");
    expect(scoreLevel(60)).toBe("medium");
    expect(scoreLevel(10)).toBe("low");
  });
});
