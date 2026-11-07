"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import type { SavedStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Saved = { isFavorite: boolean; status: SavedStatus };

/** Bascule favori (`POST /tenders/:id/favorite`). Mise à jour optimiste, annulée en cas d'erreur. */
export function FavoriteButton({
  tenderId,
  isFavorite,
  onChange,
  withLabel = false,
}: {
  tenderId: string;
  isFavorite: boolean;
  onChange?: (saved: Saved) => void;
  withLabel?: boolean;
}) {
  const [value, setValue] = useState(isFavorite);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = value ? "Retirer des favoris" : "Ajouter aux favoris";

  async function toggle() {
    const next = !value;
    setValue(next);
    setPending(true);
    setError(null);
    try {
      const saved = await api.post<Saved>(`/tenders/${tenderId}/favorite`, { isFavorite: next });
      setValue(saved.isFavorite);
      onChange?.(saved);
    } catch (e) {
      setValue(!next);
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size={withLabel ? "default" : "icon"}
        onClick={toggle}
        disabled={pending}
        aria-pressed={value}
        aria-label={withLabel ? undefined : label}
        title={label}
        data-testid="favorite-toggle"
      >
        <Star className={cn(value ? "fill-brand text-brand" : "text-ink-2")} aria-hidden />
        {withLabel && (value ? "Dans vos favoris" : "Ajouter aux favoris")}
      </Button>
      {error && (
        <span role="alert" className="text-[11px] text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
