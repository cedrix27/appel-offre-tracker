"use client";

import { useState } from "react";
import { FormAlert, FormField } from "@/components/form";
import { NativeSelect } from "@/components/inputs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { SAVED_STATUSES, SAVED_STATUS_LABELS } from "@/lib/labels";
import { noteSchema } from "@/lib/schemas";
import type { SavedStatus } from "@/lib/types";

type SavedResponse = { status?: SavedStatus; note?: string | null; isFavorite?: boolean } | undefined;

/** Statut de suivi + note interne (`PATCH /tenders/:id/status`). */
export function TrackingForm({
  tenderId,
  status,
  note,
  onSaved,
}: {
  tenderId: string;
  status: SavedStatus | null;
  note: string | null;
  onSaved?: (s: { status: SavedStatus; note: string | null }) => void;
}) {
  const [value, setValue] = useState<SavedStatus>(status ?? "TO_REVIEW");
  const [text, setText] = useState(note ?? "");
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = noteSchema.safeParse(text);
    if (!parsed.success) {
      setMsg({ tone: "danger", text: parsed.error.issues[0].message });
      return;
    }
    setPending(true);
    setMsg(null);
    try {
      const res = await api.patch<SavedResponse>(`/tenders/${tenderId}/status`, { status: value, note: text.trim() || null });
      setMsg({ tone: "success", text: "Suivi enregistré." });
      onSaved?.({ status: res?.status ?? value, note: res?.note !== undefined ? res.note : text.trim() || null });
    } catch (err) {
      setMsg({ tone: "danger", text: errorMessage(err) });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="tracking-form">
      <FormField id="saved-status" label="Statut de suivi">
        <NativeSelect id="saved-status" value={value} onChange={(e) => setValue(e.target.value as SavedStatus)} data-testid="saved-status">
          {SAVED_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SAVED_STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="saved-note" label="Note interne" hint="Visible par les membres de votre entreprise uniquement.">
        <Textarea id="saved-note" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} data-testid="saved-note" />
      </FormField>
      {msg && <FormAlert tone={msg.tone}>{msg.text}</FormAlert>}
      <Button type="submit" disabled={pending} data-testid="save-tracking">
        {pending ? "Enregistrement…" : "Enregistrer le suivi"}
      </Button>
    </form>
  );
}

/** Sélecteur de statut compact (liste de suivi), enregistré dès le changement. */
export function StatusSelect({
  tenderId,
  status,
  onChange,
}: {
  tenderId: string;
  status: SavedStatus;
  onChange?: (s: SavedStatus) => void;
}) {
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const id = `status-${tenderId}`;
  return (
    <span className="inline-flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        Statut de suivi
      </label>
      <NativeSelect
        id={id}
        value={value}
        className="w-52"
        onChange={async (e) => {
          const next = e.target.value as SavedStatus;
          const prev = value;
          setValue(next);
          setError(null);
          try {
            await api.patch(`/tenders/${tenderId}/status`, { status: next });
            onChange?.(next);
          } catch (err) {
            setValue(prev);
            setError(errorMessage(err));
          }
        }}
      >
        {SAVED_STATUSES.map((s) => (
          <option key={s} value={s}>
            {SAVED_STATUS_LABELS[s]}
          </option>
        ))}
      </NativeSelect>
      {error && (
        <span role="alert" className="text-[11px] text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
