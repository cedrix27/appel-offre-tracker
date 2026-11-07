"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormAlert, FormField, fieldAria } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-messages";
import { fieldErrors, newPasswordSchema } from "@/lib/schemas";

/** Définition d'un mot de passe à partir d'un jeton reçu par e-mail (réinitialisation ou invitation). */
export function SetPasswordForm({
  endpoint,
  submitLabel,
  successRedirect,
  testId,
}: {
  endpoint: "/auth/reset-password" | "/auth/accept-invite";
  submitLabel: string;
  successRedirect: string;
  testId: string;
}) {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <FormAlert tone="danger" testId={`${testId}-no-token`}>
        Ce lien est incomplet : aucun jeton n&apos;a été fourni. Utilisez le lien exact reçu par e-mail.
      </FormAlert>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = newPasswordSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    setFormError(null);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await api.post(endpoint, { token, password: parsed.data.password }, { auth: false });
      router.replace(successRedirect);
    } catch (err) {
      setPending(false);
      setFormError(authErrorMessage(err, "token"));
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate data-testid={testId}>
      <FormField id="password" label="Nouveau mot de passe" hint="12 caractères minimum." error={errors.password}>
        <Input {...fieldAria("password", errors.password, true)} name="password" type="password" autoComplete="new-password" />
      </FormField>
      <FormField id="confirm" label="Confirmez le mot de passe" error={errors.confirm}>
        <Input {...fieldAria("confirm", errors.confirm)} name="confirm" type="password" autoComplete="new-password" />
      </FormField>
      {formError && <FormAlert tone="danger">{formError}</FormAlert>}
      <Button type="submit" className="mt-2 w-full" disabled={pending}>
        {pending ? "Enregistrement…" : submitLabel}
      </Button>
    </form>
  );
}
