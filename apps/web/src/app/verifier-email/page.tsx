import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { LoadingBlock } from "@/components/states";
import { VerifyEmailView } from "./verify-view";

export const metadata: Metadata = { title: "Vérification de l'adresse e-mail" };

export default function VerifyEmailPage() {
  return (
    <AuthShell
      eyebrow="Activation du compte"
      title="Vérification de l'e-mail"
      footer={
        <Link href="/connexion" className="font-medium text-brand-ink hover:underline">
          Retour à la connexion
        </Link>
      }
    >
      <Suspense fallback={<LoadingBlock rows={1} />}>
        <VerifyEmailView />
      </Suspense>
    </AuthShell>
  );
}
