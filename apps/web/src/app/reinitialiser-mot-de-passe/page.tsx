import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { LoadingBlock } from "@/components/states";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Mot de passe"
      title="Choisir un nouveau mot de passe"
      description="Après la modification, vous serez déconnecté de tous vos appareils."
      footer={
        <Link href="/mot-de-passe-oublie" className="font-medium text-brand-ink hover:underline">
          Demander un nouveau lien
        </Link>
      }
    >
      <Suspense fallback={<LoadingBlock rows={1} />}>
        <SetPasswordForm
          endpoint="/auth/reset-password"
          submitLabel="Modifier le mot de passe"
          successRedirect="/connexion?reset=1"
          testId="reset-form"
        />
      </Suspense>
    </AuthShell>
  );
}
