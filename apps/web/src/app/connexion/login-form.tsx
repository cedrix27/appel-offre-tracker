"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ResendVerification } from "@/components/auth/resend-verification";
import { FormAlert, FormField, fieldAria } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, isApiError, postLoginPath } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-messages";
import { fieldErrors, loginSchema } from "@/lib/schemas";
import type { AuthUser, MeResponse } from "@/lib/types";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; code?: string; email: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = loginSchema.safeParse(data);
    setFormError(null);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await api.post<{ user: AuthUser }>("/auth/login", parsed.data, { auth: false });
      let me: MeResponse | null = null;
      try {
        me = await api.get<MeResponse>("/me", { auth: false });
      } catch {
        // La garde de /app redirigera si nécessaire.
      }
      router.replace(postLoginPath(me, params.get("next")));
      router.refresh();
    } catch (err) {
      setPending(false);
      setFormError({
        message: authErrorMessage(err, "login"),
        code: isApiError(err) ? err.code : undefined,
        email: parsed.data.email,
      });
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate data-testid="login-form">
      {params.get("verified") === "1" && (
        <FormAlert tone="success">Votre adresse e-mail est vérifiée. Vous pouvez vous connecter.</FormAlert>
      )}
      {params.get("reset") === "1" && (
        <FormAlert tone="success">Votre mot de passe a été modifié. Connectez-vous avec le nouveau.</FormAlert>
      )}
      {params.get("invite") === "1" && (
        <FormAlert tone="success">Votre compte est activé. Connectez-vous pour rejoindre votre entreprise.</FormAlert>
      )}
      <FormField id="email" label="Adresse e-mail" error={errors.email}>
        <Input {...fieldAria("email", errors.email)} name="email" type="email" autoComplete="email" inputMode="email" />
      </FormField>
      <FormField
        id="password"
        label="Mot de passe"
        error={errors.password}
        labelAside={
          <Link href="/mot-de-passe-oublie" className="inline-flex min-h-11 items-center text-[12px] text-ink-2 hover:text-ink">
            Mot de passe oublié ?
          </Link>
        }
      >
        <Input {...fieldAria("password", errors.password)} name="password" type="password" autoComplete="current-password" />
      </FormField>

      {formError && (
        <div className="flex flex-col gap-3" data-testid="login-error">
          <FormAlert tone={formError.code === "EMAIL_NOT_VERIFIED" ? "warning" : "danger"}>{formError.message}</FormAlert>
          {formError.code === "EMAIL_NOT_VERIFIED" && <ResendVerification email={formError.email} />}
        </div>
      )}

      <Button type="submit" className="mt-2 w-full" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
