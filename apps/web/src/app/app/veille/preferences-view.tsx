"use client";

import { useState } from "react";
import { Pencil, Plus, Radar, Trash2 } from "lucide-react";
import { FormAlert, FormField, fieldAria } from "@/components/form";
import { CheckboxField, TagInput } from "@/components/inputs";
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Panel } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/api";
import { NOT_SPECIFIED, formatFcfa } from "@/lib/format";
import { PROCEDURE_TYPES, SECTORS, ZONES, sectorLabel } from "@/lib/labels";
import { fieldErrors, preferenceSchema, type PreferenceFormValues } from "@/lib/schemas";
import type { WatchPreference, WatchPreferenceInput } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY: PreferenceFormValues = {
  name: "Veille principale",
  sectors: [],
  keywordsInclude: [],
  keywordsExclude: [],
  procedureTypes: [],
  regions: [],
  budgetMin: "",
  budgetMax: "",
  minScore: 40,
  recipients: [],
  isActive: true,
};

function toForm(p: WatchPreference): PreferenceFormValues {
  return {
    name: p.name,
    sectors: p.sectors,
    keywordsInclude: p.keywordsInclude,
    keywordsExclude: p.keywordsExclude,
    procedureTypes: p.procedureTypes,
    regions: p.regions,
    budgetMin: p.budgetMin != null ? String(p.budgetMin) : "",
    budgetMax: p.budgetMax != null ? String(p.budgetMax) : "",
    minScore: p.minScore,
    recipients: p.recipients,
    isActive: p.isActive,
  };
}

type Editing = { mode: "create" } | { mode: "edit"; pref: WatchPreference } | null;

export function PreferencesView() {
  const { data, error, loading, reload, mutate } = useApi<WatchPreference[]>("/watch-preferences");
  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<WatchPreference | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const prefs = data ?? [];

  async function toggleActive(p: WatchPreference, isActive: boolean) {
    mutate((list) => list?.map((x) => (x.id === p.id ? { ...x, isActive } : x)));
    try {
      await api.patch(`/watch-preferences/${p.id}`, { isActive });
      setNotice({ tone: "success", message: isActive ? `« ${p.name} » est activée.` : `« ${p.name} » est en pause.` });
    } catch (e) {
      mutate((list) => list?.map((x) => (x.id === p.id ? { ...x, isActive: !isActive } : x)));
      setNotice({ tone: "danger", message: errorMessage(e) });
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const p = toDelete;
    setToDelete(null);
    try {
      await api.del(`/watch-preferences/${p.id}`);
      mutate((list) => list?.filter((x) => x.id !== p.id));
      setNotice({ tone: "success", message: `« ${p.name} » a été supprimée.` });
    } catch (e) {
      setNotice({ tone: "danger", message: errorMessage(e) });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Veille"
        title="Préférences de veille"
        description="Chaque matin, les nouvelles annonces sont comparées à ces critères. Celles dont le score atteint votre seuil figurent dans le récapitulatif e-mail."
        actions={
          !editing && prefs.length > 0 ? (
            <Button variant="brand" onClick={() => setEditing({ mode: "create" })} data-testid="new-preference">
              <Plus aria-hidden />
              Nouvelle veille
            </Button>
          ) : null
        }
      />

      {notice && (
        <FormAlert tone={notice.tone} className="mb-4" testId="preferences-notice">
          {notice.message}
        </FormAlert>
      )}

      {editing ? (
        <PreferenceForm
          key={editing.mode === "edit" ? editing.pref.id : "new"}
          initial={editing.mode === "edit" ? editing.pref : null}
          onCancel={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setNotice({ tone: "success", message });
            reload();
          }}
        />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingBlock rows={2} />
      ) : prefs.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="Aucune veille configurée"
          testId="preferences-empty"
          action={
            <Button variant="brand" onClick={() => setEditing({ mode: "create" })} data-testid="new-preference">
              <Plus aria-hidden />
              Configurer ma veille
            </Button>
          }
        >
          Indiquez vos secteurs et mots-clés : vous recevrez chaque matin les annonces qui vous correspondent.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="preferences-list">
          {prefs.map((p) => (
            <li key={p.id}>
              <PreferenceSummary
                pref={p}
                onEdit={() => {
                  setNotice(null);
                  setEditing({ mode: "edit", pref: p });
                }}
                onDelete={() => setToDelete(p)}
                onToggle={(v) => toggleActive(p, v)}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogTitle>Supprimer cette veille ?</DialogTitle>
          <DialogDescription>
            « {toDelete?.name} » ne sera plus utilisée pour sélectionner les annonces. Cette action est définitive.
          </DialogDescription>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
            <Button variant="destructive" onClick={confirmDelete} data-testid="confirm-delete">
              <Trash2 aria-hidden />
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Chips({ items, empty = NOT_SPECIFIED, tone }: { items: string[]; empty?: string; tone?: "danger" }) {
  if (!items.length) return <span className="text-[13px] italic text-hint">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((i) => (
        <Badge key={i} variant={tone === "danger" ? "danger" : "outline"} className="max-w-full truncate">
          {i}
        </Badge>
      ))}
    </span>
  );
}

function PreferenceSummary({
  pref,
  onEdit,
  onDelete,
  onToggle,
}: {
  pref: WatchPreference;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (v: boolean) => void;
}) {
  const budget =
    pref.budgetMin == null && pref.budgetMax == null
      ? "Tous montants"
      : `${pref.budgetMin != null ? formatFcfa(pref.budgetMin) : "0"} – ${pref.budgetMax != null ? formatFcfa(pref.budgetMax) : "sans plafond"}`;
  return (
    <Panel data-testid="preference-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px] break-words">{pref.name}</h2>
          <p className="mt-1 text-[12px] text-ink-2">
            Seuil de pertinence : <span className="font-semibold text-ink tabular-nums">{pref.minScore}/100</span>
          </p>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-[13px] font-medium">
          <Switch checked={pref.isActive} onCheckedChange={(v) => onToggle(v)} aria-label={`Activer « ${pref.name} »`} />
          {pref.isActive ? "Active" : "En pause"}
        </label>
      </div>
      <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-[11px] text-ink-2">Secteurs</dt>
          <dd><Chips items={pref.sectors.map(sectorLabel)} empty="Aucun" /></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-ink-2">Mots-clés inclus</dt>
          <dd><Chips items={pref.keywordsInclude} empty="Aucun" /></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-ink-2">Mots-clés exclus</dt>
          <dd><Chips items={pref.keywordsExclude} empty="Aucun" tone="danger" /></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-ink-2">Zones</dt>
          <dd><Chips items={pref.regions} empty="Toutes zones" /></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-ink-2">Types de procédure</dt>
          <dd><Chips items={pref.procedureTypes} empty="Tous types" /></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-ink-2">Budget publié</dt>
          <dd className="font-medium">{budget}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-[11px] text-ink-2">Destinataires des e-mails</dt>
          <dd><Chips items={pref.recipients} empty="Tous les membres de l'entreprise" /></dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={onEdit} data-testid="edit-preference">
          <Pencil aria-hidden />
          Modifier
        </Button>
        <Button variant="ghost" onClick={onDelete} className="text-danger" data-testid="delete-preference">
          <Trash2 aria-hidden />
          Supprimer
        </Button>
      </div>
    </Panel>
  );
}

function PreferenceForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: WatchPreference | null;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [values, setValues] = useState<PreferenceFormValues>(() => (initial ? toForm(initial) : EMPTY));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof PreferenceFormValues>(key: K, value: PreferenceFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const toggleIn = (key: "sectors" | "procedureTypes", item: string, on: boolean) =>
    setValues((v) => ({ ...v, [key]: on ? [...v[key], item] : v[key].filter((x) => x !== item) }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = preferenceSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setFormError("Certains champs sont invalides : corrigez-les puis enregistrez.");
      return;
    }
    setErrors({});
    setPending(true);
    const body: WatchPreferenceInput = parsed.data;
    try {
      if (initial) await api.patch(`/watch-preferences/${initial.id}`, body);
      else await api.post("/watch-preferences", body);
      onSaved(initial ? `« ${body.name} » a été mise à jour.` : `« ${body.name} » est enregistrée. Elle sera appliquée dès la prochaine collecte.`);
    } catch (err) {
      setPending(false);
      setFormError(errorMessage(err));
    }
  }

  const score = Number(values.minScore) || 0;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" data-testid="preference-form">
      <Panel>
        <h2 className="text-[16px]">{initial ? "Modifier la veille" : "Nouvelle veille"}</h2>
        <div className="mt-4 grid gap-4">
          <FormField id="name" label="Nom de la veille" error={errors.name}>
            <Input {...fieldAria("name", errors.name)} value={values.name} onChange={(e) => set("name", e.target.value)} />
          </FormField>
          <label className="flex min-h-11 items-center gap-3 text-[14px] font-medium">
            <Switch checked={values.isActive} onCheckedChange={(v) => set("isActive", v)} aria-label="Veille active" />
            {values.isActive ? "Veille active : les annonces correspondantes sont envoyées" : "Veille en pause"}
          </label>
        </div>
      </Panel>

      <Panel>
        <fieldset className="min-w-0" aria-describedby={errors.sectors ? "sectors-error" : undefined}>
          <legend className="text-[16px] font-semibold">Secteurs surveillés</legend>
          <p className="mt-1 text-[12px] text-ink-2">Choisissez au moins un secteur ou un mot-clé.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="sector-options">
            {SECTORS.map((s) => (
              <CheckboxField
                key={s.code}
                name="sectors"
                value={s.code}
                label={s.label}
                checked={values.sectors.includes(s.code)}
                onChange={(e) => toggleIn("sectors", s.code, e.target.checked)}
              />
            ))}
          </div>
          {errors.sectors && (
            <p id="sectors-error" className="mt-2 text-[12px] text-danger" role="alert">
              {errors.sectors}
            </p>
          )}
        </fieldset>
      </Panel>

      <Panel>
        <h2 className="text-[16px]">Mots-clés</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <FormField
            id="keywordsInclude"
            label="Mots-clés recherchés"
            hint="Recherchés dans le titre, l'objet et la description. Entrée ou virgule pour ajouter."
            error={errors.keywordsInclude}
          >
            <TagInput
              id="keywordsInclude"
              testId="keywords-include"
              value={values.keywordsInclude}
              onChange={(v) => set("keywordsInclude", v)}
              placeholder="ex. serveur, forage"
            />
          </FormField>
          <FormField
            id="keywordsExclude"
            label="Mots-clés exclus"
            hint="Une annonce contenant l'un de ces mots est écartée."
            error={errors.keywordsExclude}
          >
            <TagInput
              id="keywordsExclude"
              testId="keywords-exclude"
              tone="danger"
              value={values.keywordsExclude}
              onChange={(v) => set("keywordsExclude", v)}
              placeholder="ex. véhicule"
            />
          </FormField>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-[16px]">Procédure, zones et budget</h2>
        <fieldset className="mt-4 min-w-0">
          <legend className="text-sm font-medium">Types de procédure</legend>
          <p className="mt-1 text-[12px] text-ink-2">Aucune case cochée = tous les types.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PROCEDURE_TYPES.map((t) => (
              <CheckboxField
                key={t}
                label={t}
                checked={values.procedureTypes.includes(t)}
                onChange={(e) => toggleIn("procedureTypes", t, e.target.checked)}
              />
            ))}
          </div>
        </fieldset>
        <div className="mt-4 grid gap-4">
          <FormField id="regions" label="Zones (ville ou « National »)" hint="Suggestions proposées ; saisie libre possible. Vide = toutes zones." error={errors.regions}>
            <TagInput id="regions" testId="regions" value={values.regions} onChange={(v) => set("regions", v)} suggestions={ZONES} placeholder="ex. Ouagadougou" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="budgetMin" label="Budget minimum (FCFA)" hint="Appliqué uniquement si le montant est publié." error={errors.budgetMin}>
              <Input
                {...fieldAria("budgetMin", errors.budgetMin, true)}
                inputMode="numeric"
                placeholder="ex. 5 000 000"
                value={values.budgetMin}
                onChange={(e) => set("budgetMin", e.target.value)}
              />
            </FormField>
            <FormField id="budgetMax" label="Budget maximum (FCFA)" hint="Vide = sans plafond." error={errors.budgetMax}>
              <Input
                {...fieldAria("budgetMax", errors.budgetMax, true)}
                inputMode="numeric"
                placeholder="ex. 100 000 000"
                value={values.budgetMax}
                onChange={(e) => set("budgetMax", e.target.value)}
              />
            </FormField>
          </div>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-[16px]">Seuil et destinataires</h2>
        <div className="mt-4 grid gap-4">
          <FormField
            id="minScore"
            label={
              <>
                Seuil de pertinence : <span className="num-xl tabular-nums">{score}/100</span>
              </>
            }
            hint="Seules les annonces dont le score atteint ce seuil sont retenues. 40 est un bon point de départ."
            error={errors.minScore}
          >
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={score}
                onChange={(e) => set("minScore", Number(e.target.value))}
                className="h-11 min-w-0 flex-1 accent-brand"
                aria-label="Seuil de pertinence (curseur)"
              />
              <Input
                {...fieldAria("minScore", errors.minScore, true)}
                type="number"
                min={0}
                max={100}
                value={String(values.minScore)}
                onChange={(e) => set("minScore", e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-20 tabular-nums"
              />
            </div>
          </FormField>
          <FormField
            id="recipients"
            label="Destinataires des e-mails"
            hint="Vide = tous les membres de l'entreprise reçoivent le récapitulatif."
            error={errors.recipients}
          >
            <TagInput
              id="recipients"
              testId="recipients"
              value={values.recipients}
              onChange={(v) => set("recipients", v)}
              validate={(v) => (EMAIL_RE.test(v) ? null : `« ${v} » n'est pas une adresse e-mail valide.`)}
              placeholder="nom@entreprise.bf"
            />
          </FormField>
        </div>
      </Panel>

      {formError && <FormAlert tone="danger" testId="preference-error">{formError}</FormAlert>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" variant="brand" disabled={pending} data-testid="save-preference">
          {pending ? "Enregistrement…" : "Enregistrer la veille"}
        </Button>
      </div>
    </form>
  );
}
