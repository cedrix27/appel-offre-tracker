import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "Créer un compte" };

const FIELDS = [
  { id: "companyName", label: "Raison sociale", type: "text", autoComplete: "organization" },
  { id: "fullName", label: "Nom et prénom", type: "text", autoComplete: "name" },
  { id: "email", label: "Adresse e-mail professionnelle", type: "email", autoComplete: "email" },
  { id: "password", label: "Mot de passe (12 caractères minimum)", type: "password", autoComplete: "new-password" },
] as const;

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="Nouvelle entreprise"
      title="Créer un compte"
      description="Configurez ensuite vos secteurs et mots-clés pour recevoir votre premier récapitulatif."
      footer={
        <>
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="font-medium text-brand-ink hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4">
        {FIELDS.map((f) => (
          <div key={f.id} className="flex flex-col gap-1.5">
            <Label htmlFor={f.id}>{f.label}</Label>
            <Input
              id={f.id}
              name={f.id}
              type={f.type}
              autoComplete={f.autoComplete}
              minLength={f.type === "password" ? 12 : undefined}
              required
            />
          </div>
        ))}
        <Button type="submit" variant="brand" className="mt-2 w-full" disabled>
          Créer mon compte
        </Button>
        <p className="text-[11px] text-ink-2">Un e-mail de vérification vous sera envoyé.</p>
      </form>
    </AuthShell>
  );
}
