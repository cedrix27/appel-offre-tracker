import { describe, expect, it } from "vitest";
import { collectionSentence, emptyListMessage } from "./collection";
import type { CollectionState } from "./types";

const base: CollectionState = {
  sourceName: "DGCMEF",
  lastRunAt: "2026-11-07T07:02:00Z",
  lastOutcome: "SUCCESS_NEW",
  latestPublicationRef: "Quotidien n°4514",
  latestPublicationDate: "2026-10-21",
};

describe("état de la collecte (règle 6)", () => {
  it("distingue les trois issues", () => {
    expect(collectionSentence(base).title).toBe("Collecte réussie le 07 novembre 2026 à 07:02 · nouvelles annonces");
    expect(collectionSentence({ ...base, itemsNew: 3 }).title).toMatch(/3 nouvelles annonces$/);
    expect(collectionSentence({ ...base, lastOutcome: "SUCCESS_NONE" }).title).toBe("Collecte réussie, aucune nouvelle annonce");
    const failed = collectionSentence({ ...base, lastOutcome: "FAILED" });
    expect(failed.title).toBe("Collecte en échec — les annonces du jour n'ont pas pu être vérifiées");
    expect(failed.title).not.toMatch(/aucun/i);
    expect(collectionSentence(null).title).toBe("Aucune collecte effectuée pour l'instant");
  });

  it("ne présente jamais un échec comme une absence d'annonce", () => {
    const msg = emptyListMessage({ ...base, lastOutcome: "FAILED" }, "Aucune nouvelle correspondance.");
    expect(msg).toMatch(/échoué/);
    expect(msg).not.toBe("Aucune nouvelle correspondance.");
    expect(emptyListMessage({ ...base, lastOutcome: "SUCCESS_NONE" }, "Aucune nouvelle correspondance.")).toBe(
      "Aucune nouvelle correspondance.",
    );
  });
});
