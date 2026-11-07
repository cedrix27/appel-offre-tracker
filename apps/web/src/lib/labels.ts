/** Libellés français des énumérations et référentiels de l'API. */

import taxonomyJson from "@src/shared/taxonomy.json";
import type {
  MemberRole,
  NotificationStatus,
  RunOutcome,
  SavedStatus,
  SourceStatus,
  TenderStatus,
} from "./types";

export const taxonomy = taxonomyJson as {
  version: number;
  sectors: { code: string; label: string; keywords: string[] }[];
  procedureTypes: string[];
  zones: string[];
};

export const SECTORS = taxonomy.sectors.map(({ code, label }) => ({ code, label }));
export const PROCEDURE_TYPES = taxonomy.procedureTypes;
export const ZONES = taxonomy.zones;

const SECTOR_LABELS = new Map(SECTORS.map((s) => [s.code, s.label]));

/** Code de taxonomie → libellé (le code inconnu est affiché tel quel). */
export function sectorLabel(code: string): string {
  return SECTOR_LABELS.get(code) ?? code;
}

export const SAVED_STATUS_LABELS: Record<SavedStatus, string> = {
  TO_REVIEW: "À examiner",
  INTERESTED: "Intéressé",
  APPLYING: "Candidature en cours",
  IGNORED: "Ignoré",
};
export const SAVED_STATUSES = Object.keys(SAVED_STATUS_LABELS) as SavedStatus[];

export const TENDER_STATUS_LABELS: Record<TenderStatus, string> = {
  NEW: "Nouveau",
  UPDATED: "Mis à jour",
  CLOSED: "Clôturé",
  CANCELLED: "Annulé",
  AWARDED: "Attribué",
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  COMPANY_ADMIN: "Administrateur",
  COMPANY_MEMBER: "Membre",
};

export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  QUEUED: "En attente",
  SENT: "Envoyé",
  FAILED: "Échec de l'envoi",
  SKIPPED: "Non envoyé — aucune nouvelle annonce",
};

export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "En pause",
  DISABLED: "Désactivée",
};

/** Les trois issues de collecte ne doivent jamais être confondues (CLAUDE.md règle 6). */
export const RUN_OUTCOME_LABELS: Record<RunOutcome, string> = {
  RUNNING: "Collecte en cours",
  SUCCESS_NEW: "Collecte réussie · nouvelles annonces",
  SUCCESS_NONE: "Collecte réussie, aucune nouvelle annonce",
  FAILED: "Collecte en échec",
};

const FIELD_LABELS: Record<string, string> = {
  title: "Intitulé",
  reference: "Référence",
  organization: "Organisme",
  description: "Objet",
  categories: "Catégorie",
  sectors: "Secteur",
  procedure_type: "Type de procédure",
  location: "Lieu d'exécution",
  publication_date: "Date de publication",
  submission_deadline: "Date limite",
  submission_time: "Heure limite",
  deadline_has_time: "Heure limite",
  estimated_budget: "Montant prévisionnel",
  budget_tax_basis: "Base du montant (HT/TTC)",
  funding_source: "Financement",
  eligibility_requirements: "Conditions de participation",
  required_documents: "Pièces requises",
  summary: "Résumé",
};

/** `submission_deadline` ou `submissionDeadline` → « Date limite ». */
export function fieldLabel(field: string): string {
  const snake = field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return FIELD_LABELS[snake] ?? field;
}
