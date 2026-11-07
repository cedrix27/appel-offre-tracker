import type { TenderCardData } from "@/components/tender-card";

/**
 * Avis RÉELS relevés à la main dans le Quotidien des marchés publics n°4514
 * (DGCMEF, 21 octobre 2026) lors de l'audit des sources — voir docs/02-audit-sources.md.
 * Utilisés uniquement comme illustration sur le site public. Les champs absents
 * de l'avis restent null.
 */
const QUOTIDIEN_4514 = "https://www.dgcmef.gov.bf/sites/default/files/2026-10/Quotidien%20n%C2%B04514.pdf";

/** Les échéances des exemples sont calculées à la date de parution du quotidien. */
export const SAMPLE_REFERENCE_DATE = new Date("2026-10-21T08:00:00Z");

export const SAMPLE_TENDERS: TenderCardData[] = [
  {
    organization: "Bureau des Mines et de la Géologie du Burkina (BUMIGEB)",
    title: "Acquisition d'outils de foration au profit du BUMIGEB",
    reference: "n°2026-15/BUMIGEB/DG/PRM du 05/10/2026",
    procedureType: "Demande de prix",
    category: "Fournitures et services courants",
    submissionDeadline: "2026-10-30T09:00:00Z",
    estimatedBudget: 82_600_000,
    budgetTaxBasis: "TTC",
    source: { name: "DGCMEF", url: QUOTIDIEN_4514, pages: [33] },
    score: 86,
  },
  {
    organization: "Ministère de la Construction de la Patrie",
    title:
      "Sélection de bureaux d'études pour trois notices d'impact environnemental et social et quatre plans d'actions de réinstallation — Bobo-Dioulasso, Kaya, Ouahigouya",
    reference: "N°2026//MCP/SG/DMP/SMT-PI",
    procedureType: "Manifestation d'intérêt",
    category: "Prestations intellectuelles",
    submissionDeadline: "2026-11-04T09:30:00Z",
    estimatedBudget: null,
    source: { name: "DGCMEF", url: QUOTIDIEN_4514, pages: [39] },
    score: 64,
  },
  {
    organization: "Burkina Yin Wisgr Méta",
    title: "Acquisition de trois (03) imprimantes de tickets pour le stade du 4 août",
    reference: "N°2026-012/BYM/DG/PRCP",
    procedureType: "Demande de prix",
    category: "Fournitures et services courants",
    submissionDeadline: "2026-10-30T09:00:00Z",
    estimatedBudget: 20_000_000,
    budgetTaxBasis: "TTC",
    source: { name: "DGCMEF", url: QUOTIDIEN_4514, pages: [32] },
    score: 41,
  },
];
