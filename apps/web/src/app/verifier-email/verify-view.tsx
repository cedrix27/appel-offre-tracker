"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { ResendVerification } from "@/components/auth/resend-verification";
import { FormAlert, FormField } from "@/components/form";
import { LoadingBlock } from "@/components/states";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-messages";

/** Un jeton n'est utilisable qu'une fois : on mémorise la requête (double effet en mode strict). */
const pending = new Map<string, Promise<unknown>>();

function verifyOnce(token: string) {
  let p = pending.get(token);
  if (!p) {
    p = api.post("/auth/verify-email", { token }, { auth: false });
    pending.set(token, p);
  }
  return p;
}

type Result = { token: string; ok: true } | { token: string; ok: false; message: string };

export function VerifyEmailView() {
  const token = useSearchParams().get("token") ?? "";
  const [result, setResult] = useState<Result | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!token) return;
    verifyOnce(token).then(
      () => setResult({ token, ok: true }),
      (e: unknown) => setResult({ token, ok: false, message: authErrorMessage(e, "token") }),
    );
  }, [token]);

  if (token && (!result || result.token !== token)) {
    return <LoadingBlock rows={1} label="Vérification de votre adresse e-mail…" />;
  }

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-4" data-testid="verify-success">
        <p className="flex items-center gap-2 font-semibold text-success">
          <CheckCircle2 className="size-5" aria-hidden />
          Adresse e-mail vérifiée
        </p>
        <p className="text-[14px] text-ink-3">Votre compte est actif. Connectez-vous pour configurer votre veille.</p>
        <Link href="/connexion?verified=1" className={buttonVariants({ className: "w-full" })}>
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="verify-error">
      <FormAlert tone="danger">
        {result && !result.ok ? result.message : "Le lien de vérification est incomplet : aucun jeton n'a été fourni."}
      </FormAlert>
      <p className="text-[13px] text-ink-3">Indiquez votre adresse e-mail pour recevoir un nouveau lien.</p>
      <FormField id="resend-email" label="Adresse e-mail">
        <Input id="resend-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
      </FormField>
      <ResendVerification email={email} />
    </div>
  );
}
