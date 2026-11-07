import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { LoadingBlock } from "@/components/states";

export const metadata: Metadata = { title: "Accepter l'invitation" };

export default function InvitationPage() {
  return (
    <AuthShell
      eyebrow="Invitation"
      title="Rejoindre votre entreprise"
      description="Un administrateur de votre entreprise vous a invité sur SRC Digital. Choisissez votre mot de passe pour activer votre compte."
      footer={
        <>
          Déjà activé ?{" "}
          <Link href="/connexion" className="font-medium text-brand-ink hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <Suspense fallback={<LoadingBlock rows={1} />}>
        <SetPasswordForm
          endpoint="/auth/accept-invite"
          submitLabel="Activer mon compte"
          successRedirect="/connexion?invite=1"
          testId="invite-form"
        />
      </Suspense>
    </AuthShell>
  );
}
