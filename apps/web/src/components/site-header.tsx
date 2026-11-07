import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex min-h-11 items-center gap-2.5", className)} aria-label="SRC Digital — accueil">
      <span className="flex size-8 items-center justify-center rounded-[10px] bg-brand text-[12px] font-bold text-white">
        SRC
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.02em]">SRC Digital</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line-soft bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Navigation principale" className="hidden items-center gap-6 text-[13px] text-ink-3 md:flex">
          <a href="#fonctionnement" className="hover:text-ink">Fonctionnement</a>
          <a href="#sources" className="hover:text-ink">Sources</a>
          <a href="#contact" className="hover:text-ink">Contact</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/connexion" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}>
            Se connecter
          </Link>
          <Link href="/inscription" className={buttonVariants({ size: "sm" })}>
            Créer un compte
          </Link>
        </div>
      </div>
    </header>
  );
}
