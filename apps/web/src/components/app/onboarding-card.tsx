import Link from "next/link";
import { ArrowRight, Radar } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Carte d'onboarding affichée tant que l'entreprise n'a aucune préférence de veille. */
export function OnboardingCard() {
  return (
    <section
      data-testid="onboarding-card"
      aria-labelledby="onboarding-title"
      className="flex flex-col gap-4 rounded-[22px] border border-brand-line bg-brand-wash p-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
          <Radar className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="eyebrow">Première étape</p>
          <h2 id="onboarding-title" className="mt-1 text-[18px]">
            Configurez votre veille
          </h2>
          <p className="mt-1 text-[13px] text-ink-3">
            Choisissez vos secteurs, mots-clés et zones : nous sélectionnerons chaque matin les annonces qui vous
            correspondent et vous les enverrons par e-mail.
          </p>
        </div>
      </div>
      <Link href="/app/veille" className={buttonVariants({ variant: "brand", className: "shrink-0" })}>
        Configurer ma veille
        <ArrowRight data-icon="inline-end" aria-hidden />
      </Link>
    </section>
  );
}
