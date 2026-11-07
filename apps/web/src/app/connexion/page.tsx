import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { LoadingBlock } from "@/components/states";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="Espace entreprise"
      title="Se connecter"
      description="Retrouvez vos appels d'offres correspondants et vos alertes."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-medium text-brand-ink hover:underline">
            Créer un compte
          </Link>
        </>
      }
    >
      <Suspense fallback={<LoadingBlock rows={2} />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
