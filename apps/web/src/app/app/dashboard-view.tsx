"use client";

import { useSession } from "@/components/app/session";
import { PageHeader } from "@/components/states";

export function DashboardView() {
  const { me } = useSession();
  return <PageHeader eyebrow={me.company?.legalName} title={`Bonjour ${me.user.fullName}`} />;
}
