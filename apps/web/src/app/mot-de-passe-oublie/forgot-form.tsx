"use client";

import { useState } from "react";
import { FormAlert, FormField, fieldAria } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-messages";
import { emailOnlySchema, fieldErrors } from "@/lib/schemas";

export function ForgotPasswordForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = emailOnlySchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    setFormError(null);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await api.post("/auth/forgot-password", parsed.data, { auth: false });
      setSentTo(parsed.data.email);
    } catch (err) {
      setFormError(authErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <FormAlert tone="success" testId="forgot-sent" title="Demande enregistrée">
        Si un compte existe pour {sentTo}, un e-mail contenant un lien de réinitialisation vient d&apos;être envoyé.
      </FormAlert>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate data-testid="forgot-form">
      <FormField id="email" label="Adresse e-mail" error={errors.email}>
        <Input {...fieldAria("email", errors.email)} name="email" type="email" autoComplete="email" inputMode="email" />
      </FormField>
      {formError && <FormAlert tone="danger">{formError}</FormAlert>}
      <Button type="submit" className="mt-2 w-full" disabled={pending}>
        {pending ? "Envoi…" : "Recevoir un lien de réinitialisation"}
      </Button>
    </form>
  );
}
