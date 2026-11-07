import { describe, expect, it } from "vitest";
import {
  companySchema,
  fieldErrors,
  inviteMemberSchema,
  loginSchema,
  newPasswordSchema,
  normalizeWebsite,
  parseFcfaInput,
  preferenceSchema,
  registerSchema,
  type PreferenceFormValues,
} from "./schemas";

describe("schémas d'authentification", () => {
  it("valide l'inscription et normalise l'e-mail", () => {
    const r = registerSchema.safeParse({
      companyName: " Faso Tech SARL ",
      fullName: "Awa Ouédraogo",
      email: " Awa@FasoTech.BF ",
      password: "motdepasse-solide",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("awa@fasotech.bf");
      expect(r.data.companyName).toBe("Faso Tech SARL");
    }
  });

  it("exige un mot de passe de 12 caractères et des champs renseignés", () => {
    const r = registerSchema.safeParse({ companyName: "", fullName: "A", email: "pas-un-email", password: "court" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = fieldErrors(r.error);
      expect(errs.password).toMatch(/12 caractères/);
      expect(errs.email).toMatch(/invalide/);
      expect(errs.companyName).toBeDefined();
      expect(errs.fullName).toBeDefined();
    }
  });

  it("exige e-mail et mot de passe à la connexion", () => {
    const r = loginSchema.safeParse({ email: "", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["email", "password"]);
  });

  it("vérifie la confirmation du nouveau mot de passe", () => {
    const r = newPasswordSchema.safeParse({ password: "un-long-mot-de-passe", confirm: "autre-chose-encore" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).confirm).toMatch(/correspondent/);
    expect(newPasswordSchema.safeParse({ password: "un-long-mot-de-passe", confirm: "un-long-mot-de-passe" }).success).toBe(true);
  });
});

describe("profil entreprise", () => {
  const base = {
    legalName: "Faso Tech SARL",
    tradeName: "",
    description: "",
    mainSector: "informatique",
    secondarySectors: ["energie"],
    skills: ["Réseaux"],
    services: [],
    city: "Ouagadougou",
    address: "",
    regions: ["Ouagadougou", "National"],
    email: "",
    phone: "+226 70 00 00 00",
    website: "fasotech.bf",
  };

  it("transforme les champs vides en null et normalise le site web", () => {
    const r = companySchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tradeName).toBeNull();
      expect(r.data.email).toBeNull();
      expect(r.data.website).toBe("https://fasotech.bf");
      expect(r.data.mainSector).toBe("informatique");
    }
  });

  it("refuse un secteur hors taxonomie, un e-mail ou un téléphone invalides", () => {
    const r = companySchema.safeParse({ ...base, mainSector: "spatial", email: "x@", phone: "abc" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["email", "mainSector", "phone"]);
  });

  it("normalizeWebsite", () => {
    expect(normalizeWebsite("")).toBe("");
    expect(normalizeWebsite("http://a.bf")).toBe("http://a.bf");
    expect(normalizeWebsite("a.bf")).toBe("https://a.bf");
  });
});

describe("préférences de veille", () => {
  const base: PreferenceFormValues = {
    name: "Veille principale",
    sectors: ["informatique"],
    keywordsInclude: ["serveur"],
    keywordsExclude: ["véhicule"],
    procedureTypes: ["Demande de prix"],
    regions: ["Ouagadougou"],
    budgetMin: "5 000 000",
    budgetMax: "",
    minScore: 40,
    recipients: ["Veille@FasoTech.bf"],
    isActive: true,
  };

  it("convertit budgets FCFA, seuil et destinataires", () => {
    const r = preferenceSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.budgetMin).toBe(5_000_000);
      expect(r.data.budgetMax).toBeNull();
      expect(r.data.minScore).toBe(40);
      expect(r.data.recipients).toEqual(["veille@fasotech.bf"]);
    }
  });

  it("exige au moins un secteur ou un mot-clé", () => {
    const r = preferenceSchema.safeParse({ ...base, sectors: [], keywordsInclude: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).sectors).toMatch(/au moins un secteur/);
    expect(preferenceSchema.safeParse({ ...base, sectors: [] }).success).toBe(true);
  });

  it("borne le seuil entre 0 et 100 et vérifie min ≤ max", () => {
    expect(preferenceSchema.safeParse({ ...base, minScore: 101 }).success).toBe(false);
    expect(preferenceSchema.safeParse({ ...base, minScore: -1 }).success).toBe(false);
    const r = preferenceSchema.safeParse({ ...base, budgetMin: "10 000 000", budgetMax: "1 000 000" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).budgetMax).toMatch(/supérieur/);
  });

  it("refuse un montant non numérique ou un destinataire invalide", () => {
    expect(preferenceSchema.safeParse({ ...base, budgetMin: "dix millions" }).success).toBe(false);
    expect(preferenceSchema.safeParse({ ...base, recipients: ["pas-un-email"] }).success).toBe(false);
  });

  it("parseFcfaInput", () => {
    expect(parseFcfaInput("")).toBeNull();
    expect(parseFcfaInput("82 600 000")).toBe(82_600_000);
    expect(parseFcfaInput("82.600.000 FCFA")).toBe(82_600_000);
    expect(parseFcfaInput("12a")).toBeNaN();
  });
});

describe("invitation d'un membre", () => {
  it("valide rôle, nom et e-mail", () => {
    expect(inviteMemberSchema.safeParse({ fullName: "Issa Kaboré", email: "issa@x.bf", role: "COMPANY_MEMBER" }).success).toBe(true);
    const r = inviteMemberSchema.safeParse({ fullName: "", email: "x", role: "SUPER_ADMIN" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["email", "fullName", "role"]);
  });
});
