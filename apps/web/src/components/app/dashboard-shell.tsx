"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, ShieldCheck, Building2 } from "lucide-react";
import { signOut, useSession } from "@/components/app/session";
import { FormAlert } from "@/components/form";
import { Logo } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ROLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  exact?: boolean;
};

export function isActive(pathname: string, item: Pick<NavItem, "href" | "exact">): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-[12px] px-3 text-[14px] font-medium text-ink-3 transition-colors hover:bg-segment hover:text-ink",
                active && "bg-surface text-ink ring-1 ring-line",
              )}
            >
              <item.icon className={cn("size-4.5 shrink-0", active ? "text-brand" : "text-ink-2")} aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarContent({
  area,
  items,
  onNavigate,
}: {
  area: "app" | "admin";
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const { me, isSuperAdmin } = useSession();
  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <p className="eyebrow">{area === "admin" ? "Administration" : "Espace entreprise"}</p>
        <p className="mt-1 truncate text-[14px] font-semibold" data-testid="shell-company">
          {area === "admin" ? "SRC Digital" : (me.company?.legalName ?? "")}
        </p>
      </div>
      <nav aria-label={area === "admin" ? "Navigation de l'administration" : "Navigation de l'espace entreprise"}>
        <NavLinks items={items} onNavigate={onNavigate} />
      </nav>
      <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
        {area === "app" && isSuperAdmin && (
          <Link href="/admin" onClick={onNavigate} className="flex min-h-11 items-center gap-2 rounded-[12px] px-3 text-[13px] font-medium text-brand-ink hover:bg-brand-soft">
            <ShieldCheck className="size-4" aria-hidden />
            Administration SRC Digital
          </Link>
        )}
        {area === "admin" && me.company && (
          <Link href="/app" onClick={onNavigate} className="flex min-h-11 items-center gap-2 rounded-[12px] px-3 text-[13px] font-medium text-brand-ink hover:bg-brand-soft">
            <Building2 className="size-4" aria-hidden />
            Espace entreprise
          </Link>
        )}
        <div className="px-3" data-testid="user-menu">
          <p className="truncate text-[13px] font-semibold">{me.user.fullName}</p>
          <p className="truncate text-[12px] text-ink-2">{me.user.email}</p>
          <p className="text-[11px] text-ink-2">
            {isSuperAdmin ? "Super administrateur" : me.membership ? ROLE_LABELS[me.membership.role] : ""}
          </p>
        </div>
        <Button variant="ghost" className="justify-start text-ink-3" onClick={signOut} data-testid="logout">
          <LogOut aria-hidden />
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}

/** Mise en page connectée : barre latérale (desktop) ; barre supérieure + menu Sheet (mobile). */
export function DashboardShell({
  area,
  items,
  children,
}: {
  area: "app" | "admin";
  items: NavItem[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { me } = useSession();
  const suspended = area === "app" && me.company?.status === "SUSPENDED";

  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line-soft bg-paper px-4 py-5 lg:flex">
        <Logo />
        <SidebarContent area={area} items={items} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line-soft bg-canvas/90 px-4 backdrop-blur lg:hidden">
          <Logo />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="outline" aria-label="Ouvrir le menu" data-testid="mobile-menu" />}>
              <Menu aria-hidden />
              Menu
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-xs overflow-y-auto bg-paper px-4 py-5">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Logo />
              <SidebarContent area={area} items={items} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>

        <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-10">
          {suspended && (
            <FormAlert tone="warning" title="Entreprise suspendue" className="mb-6">
              L&apos;accès de votre entreprise est suspendu : la veille et les alertes sont interrompues. Contactez SRC Digital.
            </FormAlert>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
