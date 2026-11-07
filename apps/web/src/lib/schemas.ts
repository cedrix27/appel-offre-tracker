/** Schémas Zod des formulaires (validation côté client ; l'API revalide tout). */

import { z } from "zod";
import { SECTORS } from "./labels";

const SECTOR_CODES = new Set(SECTORS.map((s) => s.code));

const email = z
  .string({ required_error: "Indiquez une adresse e-mail." })
  .trim()
  .toLowerCase()
  .min(1, "Indiquez une adresse e-mail.")
  .email("Adresse e-mail invalide.");

const newPassword = z
  .string()
  .min(12, "Le mot de passe doit contenir au moins 12 caractères.")
  .max(128, "Le mot de passe ne peut pas dépasser 128 caractères.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Indiquez votre mot de passe."),
});

export const registerSchema = z.object({
  companyName: z.string().trim().min(2, "Indiquez la raison sociale.").max(200, "200 caractères maximum."),
  fullName: z.string().trim().min(2, "Indiquez votre nom et prénom.").max(120, "120 caractères maximum."),
  email,
  password: newPassword,
});

export const emailOnlySchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Les deux mots de passe ne correspondent pas." });

// ───────────── Profil entreprise ─────────────

/** Chaîne optionnelle : vide → null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum.`)
    .transform((v) => (v === "" ? null : v));

const tags = z.array(z.string().trim().min(1).max(100)).max(50, "50 éléments maximum.");

/** Ajoute https:// à un site saisi sans protocole. */
export function normalizeWebsite(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export const companySchema = z.object({
  legalName: z.string().trim().min(2, "Indiquez la raison sociale.").max(200, "200 caractères maximum."),
  tradeName: optionalText(200),
  description: optionalText(2000),
  mainSector: z
    .string()
    .refine((v) => v === "" || SECTOR_CODES.has(v), "Secteur inconnu.")
    .transform((v) => (v === "" ? null : v)),
  secondarySectors: z.array(z.string().refine((v) => SECTOR_CODES.has(v), "Secteur inconnu.")),
  skills: tags,
  services: tags,
  city: optionalText(120),
  address: optionalText(300),
  regions: tags,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Adresse e-mail invalide.")
    .transform((v) => (v === "" ? null : v)),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\+?[0-9 ().-]{8,20}$/.test(v), "Numéro invalide (ex. +226 70 00 00 00).")
    .transform((v) => (v === "" ? null : v)),
  website: z
    .string()
    .transform(normalizeWebsite)
    .refine((v) => v === "" || z.string().url().safeParse(v).success, "Adresse de site invalide.")
    .transform((v) => (v === "" ? null : v)),
});

export type CompanyFormValues = z.input<typeof companySchema>;

// ───────────── Préférences de veille ─────────────

/** « 10 000 000 » ou « 10.000.000 » → 10000000 ; vide → null ; invalide → NaN. */
export function parseFcfaInput(value: string): number | null {
  const v = value.replace(/[\s  .,]/g, "").replace(/fcfa$/i, "");
  if (v === "") return null;
  return /^\d+$/.test(v) ? Number(v) : Number.NaN;
}

const budget = z
  .string()
  .transform(parseFcfaInput)
  .refine((v) => v === null || (Number.isSafeInteger(v) && v >= 0), "Montant invalide (chiffres uniquement, en FCFA).");

export const preferenceSchema = z
  .object({
    name: z.string().trim().min(1, "Donnez un nom à cette veille.").max(100, "100 caractères maximum."),
    sectors: z.array(z.string().refine((v) => SECTOR_CODES.has(v), "Secteur inconnu.")),
    keywordsInclude: tags,
    keywordsExclude: tags,
    procedureTypes: z.array(z.string()),
    regions: tags,
    budgetMin: budget,
    budgetMax: budget,
    minScore: z.coerce
      .number({ invalid_type_error: "Seuil invalide." })
      .int("Le seuil doit être un nombre entier.")
      .min(0, "Le seuil doit être compris entre 0 et 100.")
      .max(100, "Le seuil doit être compris entre 0 et 100."),
    recipients: z.array(z.string().trim().toLowerCase().email("Adresse e-mail invalide.")).max(20, "20 destinataires maximum."),
    isActive: z.boolean(),
  })
  .refine((v) => v.sectors.length > 0 || v.keywordsInclude.length > 0, {
    path: ["sectors"],
    message: "Choisissez au moins un secteur ou un mot-clé à surveiller.",
  })
  .refine((v) => v.budgetMin === null || v.budgetMax === null || v.budgetMin <= v.budgetMax, {
    path: ["budgetMax"],
    message: "Le budget maximum doit être supérieur ou égal au minimum.",
  });

export type PreferenceFormValues = z.input<typeof preferenceSchema>;

// ───────────── Membres & suivi ─────────────

export const inviteMemberSchema = z.object({
  fullName: z.string().trim().min(2, "Indiquez le nom et prénom.").max(120, "120 caractères maximum."),
  email,
  role: z.enum(["COMPANY_ADMIN", "COMPANY_MEMBER"], { errorMap: () => ({ message: "Choisissez un rôle." }) }),
});

export const noteSchema = z.string().max(2000, "La note ne peut pas dépasser 2 000 caractères.");

export const demoRequestSchema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom."),
  company: z.string().trim().min(2, "Indiquez votre entreprise."),
  email,
  phone: z.string().trim().max(30),
  message: z.string().trim().max(1000, "1 000 caractères maximum."),
});

/** Erreurs Zod → { champ: premier message }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
