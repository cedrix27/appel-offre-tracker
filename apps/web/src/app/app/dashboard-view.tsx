"use client";

import { useSession } from "@/components/app/session";
import { OnboardingCard } from "@/components/app/onboarding-card";
import { PageHeader } from "@/components/states";
import type { WatchPreference } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function DashboardView() {
  const { me } = useSession();
  const prefs = useApi<WatchPreference[]>("/watch-preferences");
  return (
    <>
      <PageHeader eyebrow={me.company?.legalName} title={`Bonjour ${me.user.fullName}`} />
      {prefs.data && prefs.data.length === 0 && <OnboardingCard />}
    </>
  );
}
