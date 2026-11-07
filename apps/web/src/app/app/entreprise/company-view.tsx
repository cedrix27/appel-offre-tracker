"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useSession } from "@/components/app/session";
import { FormAlert, FormField, fieldAria } from "@/components/form";
import { CheckboxField, NativeSelect, TagInput } from "@/components/inputs";
import { ErrorState, LoadingBlock, PageHeader, Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { SECTORS, ZONES } from "@/lib/labels";
import { companySchema, fieldErrors, type CompanyFormValues } from "@/lib/schemas";
import type { Company } from "@/lib/types";
import { useApi } from "@/lib/use-api";

function toForm(c: Company): CompanyFormValues {
  return {
    legalName: c.legalName ?? "",
    tradeName: c.tradeName ?? "",
    description: c.description ?? "",
    mainSector: c.mainSector ?? "",
    secondarySectors: c.secondarySectors ?? [],
    skills: c.skills ?? [],
    services: c.services ?? [],
    city: c.city ?? "",
    address: c.address ?? "",
    regions: c.regions ?? [],
    email: c.email ?? "",
    phone: c.phone ?? "",
    website: c.website ?? "",
  };
}

export function CompanyView() {
  const { data, error, loading, reload } = useApi<Company>("/company");
  return (
    <>
      <PageHeader
        eyebrow="Entreprise"
        title="Profil de l'entreprise"
        description="Ces informations décrivent votre activité. Elles complètent vos préférences de veille."
      />
      {error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : loading || !data ? (
        <LoadingBlock rows={4} />
      ) : (
        <CompanyForm key={data.id} company={data} />
      )}
    </>
  );
}

function CompanyForm({ company }: { company: Company }) {
  const { isCompanyAdmin, reload: reloadSession } = useSession();
  const readOnly = !isCompanyAdmin;
  const [values, setValues] = useState<CompanyFormValues>(() => toForm(company));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const parsed = companySchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setStatus({ tone: "danger", message: "Certains champs sont invalides : corrigez-les puis enregistrez." });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const updated = await api.patch<Company | undefined>("/company", parsed.data);
      if (updated && typeof updated === "object" && "legalName" in updated) setValues(toForm(updated));
      setStatus({ tone: "success", message: "Profil enregistré." });
      if (parsed.data.legalName !== company.legalName) reloadSession();
    } catch (err) {
      setStatus({ tone: "danger", message: errorMessage(err) });
    } finally {
      setPending(false);
    }
  }

  const text = (key: "legalName" | "tradeName" | "city" | "address" | "email" | "phone" | "website", label: string, props: React.ComponentProps<"input"> = {}) => (
    <FormField id={key} label={label} error={errors[key]}>
      <Input
        {...fieldAria(key, errors[key])}
        value={values[key] as string}
        onChange={(e) => set(key, e.target.value)}
        disabled={readOnly}
        {...props}
      />
    </FormField>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" data-testid="company-form">
      {readOnly && (
        <FormAlert tone="info" title="Lecture seule">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden />
            Seul un administrateur de l&apos;entreprise peut modifier ce profil.
          </span>
        </FormAlert>
      )}

      <Panel aria-labelledby="identite">
        <h2 id="identite" className="text-[16px]">Identité</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {text("legalName", "Raison sociale", { autoComplete: "organization" })}
          {text("tradeName", "Nom commercial")}
          <FormField id="description" label="Description de l'activité" error={errors.description} className="sm:col-span-2">
            <Textarea
              {...fieldAria("description", errors.description)}
              value={values.description as string}
              onChange={(e) => set("description", e.target.value)}
              disabled={readOnly}
              rows={4}
            />
          </FormField>
        </div>
      </Panel>

      <Panel aria-labelledby="activite">
        <h2 id="activite" className="text-[16px]">Activité</h2>
        <div className="mt-4 grid gap-4">
          <FormField id="mainSector" label="Secteur principal" error={errors.mainSector}>
            <NativeSelect
              {...fieldAria("mainSector", errors.mainSector)}
              value={values.mainSector as string}
              onChange={(e) => {
                const code = e.target.value;
                setValues((v) => ({ ...v, mainSector: code, secondarySectors: v.secondarySectors.filter((s) => s !== code) }));
              }}
              disabled={readOnly}
            >
              <option value="">Non précisé</option>
              {SECTORS.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <fieldset className="min-w-0">
            <legend className="text-sm font-medium">Secteurs secondaires</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SECTORS.filter((s) => s.code !== values.mainSector).map((s) => (
                <CheckboxField
                  key={s.code}
                  label={s.label}
                  checked={values.secondarySectors.includes(s.code)}
                  disabled={readOnly}
                  onChange={(e) =>
                    set(
                      "secondarySectors",
                      e.target.checked ? [...values.secondarySectors, s.code] : values.secondarySectors.filter((x) => x !== s.code),
                    )
                  }
                />
              ))}
            </div>
          </fieldset>
          <FormField id="skills" label="Compétences" hint="Ex. réseaux, génie civil, forage… Entrée pour ajouter." error={errors.skills}>
            <TagInput id="skills" value={values.skills} onChange={(v) => set("skills", v)} disabled={readOnly} placeholder="Ajouter une compétence" />
          </FormField>
          <FormField id="services" label="Prestations" hint="Ex. fourniture de matériel informatique, maintenance." error={errors.services}>
            <TagInput id="services" value={values.services} onChange={(v) => set("services", v)} disabled={readOnly} placeholder="Ajouter une prestation" />
          </FormField>
          <FormField id="regions" label="Zones d'intervention au Burkina Faso" error={errors.regions}>
            <TagInput
              id="regions"
              value={values.regions}
              onChange={(v) => set("regions", v)}
              suggestions={ZONES}
              disabled={readOnly}
              placeholder="Ville ou « National »"
            />
          </FormField>
        </div>
      </Panel>

      <Panel aria-labelledby="coordonnees">
        <h2 id="coordonnees" className="text-[16px]">Coordonnées</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {text("city", "Ville")}
          {text("address", "Adresse", { autoComplete: "street-address" })}
          {text("email", "E-mail de contact", { type: "email", autoComplete: "email", inputMode: "email" })}
          {text("phone", "Téléphone", { type: "tel", autoComplete: "tel", placeholder: "+226 70 00 00 00" })}
          {text("website", "Site web", { type: "url", inputMode: "url", placeholder: "www.exemple.bf" })}
        </div>
      </Panel>

      {status && <FormAlert tone={status.tone} testId="company-status">{status.message}</FormAlert>}
      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? "Enregistrement…" : "Enregistrer le profil"}
          </Button>
        </div>
      )}
    </form>
  );
}
