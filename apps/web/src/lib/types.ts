/**
 * Types des réponses de l'API NestJS — contrat PLAN.md §5.
 * Toute donnée extraite d'un avis peut être absente (`null`) : elle s'affiche « Non précisé ».
 * Dates : chaînes ISO-8601 UTC. Montants : `number` en FCFA.
 */

export type GlobalRole = "SUPER_ADMIN" | "USER";
export type MemberRole = "COMPANY_ADMIN" | "COMPANY_MEMBER";
export type AccountStatus = "ACTIVE" | "SUSPENDED";
export type SavedStatus = "TO_REVIEW" | "INTERESTED" | "APPLYING" | "IGNORED";
export type TenderStatus = "NEW" | "UPDATED" | "CLOSED" | "CANCELLED" | "AWARDED";
export type RunOutcome = "RUNNING" | "SUCCESS_NEW" | "SUCCESS_NONE" | "FAILED";
export type NotificationStatus = "QUEUED" | "SENT" | "FAILED" | "SKIPPED";
export type SourceStatus = "ACTIVE" | "PAUSED" | "DISABLED";
export type TenderSort = "relevance" | "deadline" | "recent";

export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };

/** Erreur normalisée renvoyée par l'API : `{ statusCode, message, code? }`. */
export type ApiErrorBody = { statusCode: number; message: string | string[]; code?: string };

// ───────────── Auth & session ─────────────

export type AuthUser = { id: string; email: string; fullName: string; globalRole?: GlobalRole };

export type MeResponse = {
  user: { id: string; email: string; fullName: string; globalRole: GlobalRole };
  company: { id: string; legalName: string; status: AccountStatus } | null;
  membership: { role: MemberRole } | null;
};

// ───────────── Entreprise ─────────────

export type Company = {
  id: string;
  legalName: string;
  tradeName: string | null;
  description: string | null;
  mainSector: string | null;
  secondarySectors: string[];
  skills: string[];
  services: string[];
  city: string | null;
  address: string | null;
  regions: string[];
  email: string | null;
  phone: string | null;
  website: string | null;
  status: AccountStatus;
};

export type CompanyMember = {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: MemberRole;
  invitedPending: boolean;
};

// ───────────── Préférences & référentiels ─────────────

export type TaxonomyResponse = {
  sectors: { code: string; label: string }[];
  procedureTypes: string[];
  zones: string[];
};

export type WatchPreference = {
  id: string;
  name: string;
  sectors: string[];
  keywordsInclude: string[];
  keywordsExclude: string[];
  procedureTypes: string[];
  regions: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  minScore: number;
  recipients: string[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type WatchPreferenceInput = Omit<WatchPreference, "id" | "createdAt" | "updatedAt">;

// ───────────── Annonces ─────────────

export type MatchReason = { code: string; label: string; points: number };

export type TenderListItem = {
  id: string;
  title: string;
  reference: string | null;
  organization: string | null;
  categories: string[];
  sectors: string[];
  procedureType: string | null;
  location: string | null;
  publicationDate: string | null;
  submissionDeadline: string | null;
  deadlineHasTime: boolean;
  estimatedBudget: number | null;
  budgetTaxBasis: string | null;
  summary: string | null;
  status: TenderStatus;
  missingOrUncertainFields: string[];
  source: { code: string; name: string };
  sourceUrl: string;
  sourcePages: number[];
  match: { score: number; reasons: MatchReason[]; matchedKeywords: string[] } | null;
  saved: { isFavorite: boolean; status: SavedStatus } | null;
  isNew: boolean;
};

export type TenderDetail = TenderListItem & {
  description: string | null;
  fundingSource: string | null;
  eligibilityRequirements: string[];
  requiredDocuments: string[];
  documents: { label: string | null; url: string }[];
  evidence: Record<string, unknown> | null;
  collectedAt: string | null;
  lastVerifiedAt: string | null;
  extractionModel: string | null;
  publication: {
    externalRef: string;
    publicationDate: string | null;
    fileUrl: string | null;
    pageUrl: string | null;
  } | null;
  note: string | null;
};

/** Valeurs présentes en base. Les secteurs peuvent être des codes ou des `{code,label}`. */
export type TenderFiltersResponse = {
  organizations: string[];
  sectors: (string | { code: string; label: string })[];
  procedureTypes: string[];
  locations: string[];
};

// ───────────── Dashboard & alertes ─────────────

export type CollectionState = {
  sourceName: string | null;
  lastRunAt: string | null;
  lastOutcome: RunOutcome | null;
  latestPublicationRef: string | null;
  latestPublicationDate: string | null;
  /** Non garanti par le contrat : affiché s'il est fourni. */
  itemsNew?: number | null;
};

export type DashboardSummary = {
  newMatches24h: number;
  newMatches7d: number;
  openMatches: number;
  favorites: number;
  deadlinesSoon: TenderListItem[];
  recentMatches: TenderListItem[];
  collection: CollectionState | null;
  /** Non garanti par le contrat : sert à l'onboarding si présent. */
  preferencesCount?: number;
};

export type NotificationItem = {
  id: string;
  digestDate: string;
  status: NotificationStatus;
  recipients: string[];
  tenderCount: number;
  subject: string | null;
  sentAt: string | null;
  error: string | null;
  company?: { id?: string; legalName: string } | null;
  companyName?: string | null;
};

// ───────────── Administration ─────────────

export type AdminStats = Record<string, unknown>;

export type AdminCompany = {
  id: string;
  legalName: string;
  tradeName?: string | null;
  status: AccountStatus;
  memberCount?: number;
  membersCount?: number;
  _count?: { members?: number };
  createdAt?: string;
};

export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  globalRole: GlobalRole;
  status: AccountStatus;
  emailVerifiedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  company?: { id?: string; legalName: string } | null;
  companyName?: string | null;
  role?: MemberRole | null;
};

export type AdminSource = {
  id: string;
  code: string;
  name: string;
  baseUrl: string;
  type: string;
  accessMethod?: string;
  frequencyCron?: string;
  status: SourceStatus;
  lastSuccessAt: string | null;
  errorRate: number;
  notes?: string | null;
  lastRun?: SourceRunItem | null;
};

export type SourceRunItem = {
  id: string;
  sourceId: string;
  jobId?: string | null;
  startedAt: string;
  finishedAt: string | null;
  outcome: RunOutcome;
  publicationsFound?: number;
  itemsFound?: number;
  itemsNew?: number;
  itemsUpdated?: number;
  errorMessage: string | null;
  source?: { code: string; name: string } | null;
};

export type PipelineRunItem = {
  id: string;
  runDate: string;
  trigger: string;
  status: string;
  steps: unknown;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

export type AdminTender = TenderListItem & {
  extractionModel?: string | null;
  collectedAt?: string | null;
};
