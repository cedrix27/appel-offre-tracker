"use client";

import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { FormAlert } from "@/components/form";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";

const COOLDOWN_S = 30;

/** Bouton « Renvoyer l'e-mail de vérification » (réponse 202 toujours, pas d'énumération). */
export function ResendVerification({ email, variant = "outline" }: { email: string; variant?: "outline" | "default" }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    setState("sending");
    setError(null);
    try {
      await api.post("/auth/resend-verification", { email }, { auth: false });
      setState("sent");
      setCooldown(COOLDOWN_S);
    } catch (e) {
      setState("error");
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant={variant}
        className="w-full"
        onClick={resend}
        disabled={state === "sending" || cooldown > 0 || !email}
        data-testid="resend-verification"
      >
        <MailCheck aria-hidden />
        {state === "sending"
          ? "Envoi…"
          : cooldown > 0
            ? `Renvoyer l'e-mail (${cooldown} s)`
            : "Renvoyer l'e-mail de vérification"}
      </Button>
      {state === "sent" && (
        <FormAlert tone="success">
          Si un compte non vérifié existe pour {email}, un nouvel e-mail vient d&apos;être envoyé.
        </FormAlert>
      )}
      {state === "error" && error && <FormAlert tone="danger">{error}</FormAlert>}
    </div>
  );
}
