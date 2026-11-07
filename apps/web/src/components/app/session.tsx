"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { Building2, Lock } from "lucide-react";
import { Logo } from "@/components/site-header";
import { ErrorState, LoadingBlock } from "@/components/states";
import { Button, buttonVariants } from "@/components/ui/button";
import { logout } from "@/lib/api";
import type { MeResponse } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type Session = { me: MeResponse; reload: () => void; isCompanyAdmin: boolean; isSuperAdmin: boolean };

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession doit être utilisé sous <SessionGate>.");
  return s;
}

export async function signOut() {
  await logout();
  // Rechargement complet volontaire : aucun état de session ne doit survivre à la déconnexion.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/connexion");
}

function FullPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12">
      <Logo />
      <div className="mt-8 w-full max-w-[480px]">{children}</div>
    </main>
  );
}

function Blocked({
  icon: Icon,
  title,
  children,
  testId,
}: {
  icon: typeof Lock;
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <FullPage>
      <div className="rounded-[22px] border border-line bg-surface p-6 sm:p-8" data-testid={testId}>
        <span className="flex size-11 items-center justify-center rounded-xl bg-segment text-ink-3">
          <Icon className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 text-[22px] tracking-[-0.03em]">{title}</h1>
        <div className="mt-2 flex flex-col gap-4 text-[14px] text-ink-3">{children}</div>
      </div>
    </FullPage>
  );
}

/**
 * Garde de route côté client (D20) : charge `GET /me`. Un 401 non rafraîchissable redirige
 * vers /connexion?next=… (client API). L'API applique de toute façon ses propres contrôles.
 */
export function SessionGate({ require, children }: { require: "company" | "superAdmin"; children: React.ReactNode }) {
  const { data: me, error, reload } = useApi<MeResponse>("/me");

  if (error && error.statusCode !== 401) {
    return (
      <FullPage>
        <ErrorState title="Impossible de charger votre session" message={error.message} onRetry={reload} />
      </FullPage>
    );
  }
  if (!me) {
    return (
      <FullPage>
        <LoadingBlock rows={2} label="Chargement de votre espace…" />
      </FullPage>
    );
  }

  const isSuperAdmin = me.user.globalRole === "SUPER_ADMIN";

  if (require === "superAdmin" && !isSuperAdmin) {
    return (
      <Blocked icon={Lock} title="Accès réservé" testId="forbidden">
        <p>Cette zone est réservée à l&apos;équipe SRC Digital (erreur 403).</p>
        <Link href="/app" className={buttonVariants({ className: "self-start" })}>
          Retour à mon espace
        </Link>
      </Blocked>
    );
  }

  if (require === "company" && !me.company) {
    return (
      <Blocked icon={Building2} title="Aucune entreprise associée" testId="no-company">
        {isSuperAdmin ? (
          <>
            <p>Votre compte d&apos;administration SRC Digital n&apos;est rattaché à aucune entreprise cliente.</p>
            <Link href="/admin" className={buttonVariants({ className: "self-start" })}>
              Aller à l&apos;administration
            </Link>
          </>
        ) : (
          <>
            <p>
              Votre compte n&apos;est rattaché à aucune entreprise. Demandez à l&apos;administrateur de votre entreprise de
              vous inviter, ou contactez SRC Digital.
            </p>
            <Button variant="outline" className="self-start" onClick={signOut}>
              Se déconnecter
            </Button>
          </>
        )}
      </Blocked>
    );
  }

  const value: Session = {
    me,
    reload,
    isSuperAdmin,
    isCompanyAdmin: me.membership?.role === "COMPANY_ADMIN",
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
