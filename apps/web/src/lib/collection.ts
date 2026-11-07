import { formatDateTime } from "./format";
import type { CollectionState } from "./types";

/**
 * Phrase d'état de la collecte. Règle 6 : un échec n'est jamais présenté comme
 * « aucun appel d'offres ».
 */
export function collectionSentence(c: CollectionState | null | undefined): { title: string; detail: string } {
  if (!c || !c.lastOutcome) {
    return { title: "Aucune collecte effectuée pour l'instant", detail: "La première collecte aura lieu à 07:00 (heure de Ouagadougou)." };
  }
  const when = formatDateTime(c.lastRunAt);
  switch (c.lastOutcome) {
    case "SUCCESS_NEW": {
      const n = c.itemsNew != null && c.itemsNew > 0 ? ` · ${c.itemsNew} nouvelle${c.itemsNew > 1 ? "s" : ""} annonce${c.itemsNew > 1 ? "s" : ""}` : " · nouvelles annonces";
      return { title: `Collecte réussie le ${when}${n}`, detail: "" };
    }
    case "SUCCESS_NONE":
      return { title: "Collecte réussie, aucune nouvelle annonce", detail: `Dernière vérification le ${when}.` };
    case "FAILED":
      return {
        title: "Collecte en échec — les annonces du jour n'ont pas pu être vérifiées",
        detail: `Tentative du ${when}. Les annonces affichées datent de la dernière collecte réussie.`,
      };
    case "RUNNING":
      return { title: "Collecte en cours", detail: `Démarrée le ${when}.` };
  }
}
