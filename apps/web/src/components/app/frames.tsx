"use client";

import {
  Activity,
  BellRing,
  Building,
  Building2,
  Database,
  FileText,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Mail,
  Radar,
  Star,
  Users,
  Workflow,
} from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/app/dashboard-shell";
import { SessionGate } from "@/components/app/session";

export const APP_NAV: NavItem[] = [
  { href: "/app", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/app/annonces", label: "Annonces", icon: FileText },
  { href: "/app/suivi", label: "Favoris & suivi", icon: Star },
  { href: "/app/veille", label: "Veille", icon: Radar },
  { href: "/app/entreprise", label: "Entreprise", icon: Building2 },
  { href: "/app/membres", label: "Membres", icon: Users },
  { href: "/app/alertes", label: "Alertes", icon: BellRing },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Vue d'ensemble", icon: Gauge, exact: true },
  { href: "/admin/entreprises", label: "Entreprises", icon: Building },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users },
  { href: "/admin/sources", label: "Sources", icon: Database },
  { href: "/admin/collectes", label: "Collectes", icon: Activity },
  { href: "/admin/pipeline", label: "Pipeline", icon: Workflow },
  { href: "/admin/notifications", label: "Notifications", icon: Mail },
  { href: "/admin/annonces", label: "Annonces", icon: ListChecks },
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate require="company">
      <DashboardShell area="app" items={APP_NAV}>
        {children}
      </DashboardShell>
    </SessionGate>
  );
}

export function AdminFrame({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate require="superAdmin">
      <DashboardShell area="admin" items={ADMIN_NAV}>
        {children}
      </DashboardShell>
    </SessionGate>
  );
}
