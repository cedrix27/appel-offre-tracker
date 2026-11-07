"use client";

import { useState } from "react";
import Link from "next/link";
import { MailOpen } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { ResendVerification } from "@/components/auth/resend-verification";
import { FormAlert, FormField, fieldAria } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-messages";
import { fieldErrors, registerSchema } from "@/lib/schemas";

const FIELDS = [
  { id: "companyName", label: "Raison sociale", type: "text", autoComplete: "organization" },
  { id: "fullName", label: "Nom et prénom", type: "text", autoComplete: "name" },
  { id: "email", label: "Adresse e-mail professionnelle", type: "email", autoComplete: "email" },
  { id: "password", label: "Mot de passe", type: "password", autoComplete: "new-password", hint: "12 caractères minimum." },
] as const;

const loginLink = (
  <>
    Déjà inscrit ?{" "}
    <Link href="/connexion" className="font-medium text-brand-ink hover:underline">
      Se connecter
    </Link>
  </>
);

export function RegisterView() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = registerSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    setFormError(null);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await api.post("/auth/register", parsed.data, { auth: false });
      setRegisteredEmail(parsed.data.email);
    } catch (err) {
      setFormError(authErrorMessage(err, "register"));
    } finally {
      setPending(false);
    }
  }

  if (registeredEmail) {
    return (
      <AuthShell eyebrow="Dernière étape" title="Vérifiez votre e-mail" footer={loginLink}>
        <div className="flex flex-col gap-4" data-testid="register-success">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-ink">
            <MailOpen className="size-6" aria-hidden />
          </span>
          <p className="text-[14px]">
            Nous avons envoyé un lien de vérification à <strong className="break-all">{registeredEmail}</strong>. Ouvrez-le
            pour activer votre compte, puis connectez-vous.
          </p>
          <p className="text-[12px] text-ink-2">
            Le lien est valable pendant une durée limitée. Pensez à vérifier vos courriers indésirables.
          </p>
          <ResendVerification email={registeredEmail} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Nouvelle entreprise"
      title="Créer un compte"
      description="Configurez ensuite vos secteurs et mots-clés pour recevoir votre premier récapitulatif."
      footer={loginLink}
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate data-testid="register-form">
        {FIELDS.map((f) => (
          <FormField key={f.id} id={f.id} label={f.label} error={errors[f.id]} hint={"hint" in f ? f.hint : undefined}>
            <Input
              {...fieldAria(f.id, errors[f.id], "hint" in f)}
              name={f.id}
              type={f.type}
              autoComplete={f.autoComplete}
            />
          </FormField>
        ))}
        {formError && <FormAlert tone="danger">{formError}</FormAlert>}
        <Button type="submit" variant="brand" className="mt-2 w-full" disabled={pending}>
          {pending ? "Création du compte…" : "Créer mon compte"}
        </Button>
        <p className="text-[11px] text-ink-2">
          Un e-mail de vérification vous sera envoyé. En créant un compte, vous acceptez notre{" "}
          <Link href="/confidentialite" className="underline">
            politique de confidentialité
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  );
}
