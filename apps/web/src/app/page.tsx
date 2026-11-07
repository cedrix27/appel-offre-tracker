import Link from "next/link";
import { ArrowRight, BellRing, FileSearch, Filter, ShieldCheck } from "lucide-react";
import { SiteHeader, Logo } from "@/components/site-header";
import { TenderCard } from "@/components/tender-card";
import { buttonVariants } from "@/components/ui/button";
import { SAMPLE_REFERENCE_DATE, SAMPLE_TENDERS } from "@/lib/sample-tenders";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    icon: FileSearch,
    title: "Collecte quotidienne",
    text: "Chaque matin, nous récupérons les nouvelles publications officielles des marchés publics burkinabè.",
  },
  {
    icon: Filter,
    title: "Tri selon votre profil",
    text: "Secteurs, mots-clés, exclusions, régions : seules les annonces pertinentes pour vous sont retenues, avec un score sur 100.",
  },
  {
    icon: BellRing,
    title: "Récapitulatif à 7 h",
    text: "Un e-mail par jour avec les opportunités, les dates limites et le lien vers la publication officielle.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:pt-24">
          <div className="min-w-0 animate-fade-up">
            <p className="eyebrow">Veille des marchés publics · Burkina Faso</p>
            <h1 className="mt-4 text-[40px] leading-[1.05] tracking-[-0.04em] sm:text-[56px]">
              Les appels d&apos;offres qui vous concernent, <span className="text-brand">chaque matin.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] text-ink-3">
              SRC Digital lit pour vous les publications officielles, sélectionne les avis adaptés à votre entreprise et vous
              envoie un récapitulatif vérifiable — jamais de date ou de montant inventé.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/inscription" className={buttonVariants({ variant: "brand", size: "lg" })}>
                Commencer la veille
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Link>
              <a href="#contact" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Demander une démonstration
              </a>
            </div>
            <p className="mt-6 flex items-center gap-2 text-[12px] text-ink-2">
              <ShieldCheck className="size-4 text-success" aria-hidden />
              Chaque annonce renvoie vers sa source officielle.
            </p>
          </div>

          <div className="relative min-w-0">
            <p className="mb-3 text-[12px] text-ink-2">
              Exemples réels — Quotidien des marchés publics n°4514, situation au 21 octobre 2026
            </p>
            <div className="flex flex-col gap-3">
              {SAMPLE_TENDERS.slice(0, 2).map((t, i) => (
                <TenderCard
                  key={t.reference}
                  tender={t}
                  now={SAMPLE_REFERENCE_DATE}
                  className="animate-fade-up"
                  style={{ animationDelay: `${(i + 1) * 60}ms` }}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Fonctionnement */}
        <section id="fonctionnement" className="border-y border-line-soft bg-paper">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="eyebrow">Fonctionnement</p>
            <h2 className="mt-3 max-w-2xl text-[32px] leading-tight tracking-[-0.03em]">
              Moins de temps à chercher, plus de temps pour préparer vos offres.
            </h2>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-line bg-surface p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                      <s.icon className="size-5" aria-hidden />
                    </span>
                    <span className="text-[12px] font-semibold text-ink-2">Étape {i + 1}</span>
                  </div>
                  <h3 className="mt-5 text-[17px]">{s.title}</h3>
                  <p className="mt-2 text-[14px] text-ink-3">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Sources */}
        <section id="sources" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <p className="eyebrow">Sources</p>
              <h2 className="mt-3 text-[32px] leading-tight tracking-[-0.03em]">Des données vérifiables, pas des suppositions.</h2>
              <p className="mt-4 text-[14px] text-ink-3">
                Notre première source est le Quotidien des marchés publics de la DGCMEF. Lorsqu&apos;une information
                n&apos;est pas publiée dans l&apos;avis, nous l&apos;indiquons clairement « Non précisé ».
              </p>
              <ul className="mt-6 space-y-3 text-[14px]">
                <li className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                  Lien direct vers le PDF officiel et la page de l&apos;avis
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                  Date de collecte et de dernière vérification conservées
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                  Le score indique la pertinence, pas l&apos;éligibilité : consultez toujours le dossier officiel
                </li>
              </ul>
            </div>
            <TenderCard tender={SAMPLE_TENDERS[2]} now={SAMPLE_REFERENCE_DATE} />
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="rounded-[28px] bg-ink px-6 py-14 text-white sm:px-12">
            <p className="text-[11px] font-semibold tracking-[0.13em] text-brand-line uppercase">Pilote · décembre 2026</p>
            <h2 className="mt-3 max-w-2xl text-[32px] leading-tight tracking-[-0.03em] text-white">
              Rejoignez les premières entreprises pilotes.
            </h2>
            <p className="mt-3 max-w-xl text-[14px] text-white/70">
              Nous ouvrons SRC Digital à un petit groupe d&apos;entreprises burkinabè pour la phase pilote.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/inscription" className={buttonVariants({ variant: "brand", size: "lg" })}>
                Créer un compte
              </Link>
              {/* TODO: remplacer par l'adresse de contact officielle de SRC Digital */}
              <Link
                href="/connexion"
                className={cn(buttonVariants({ size: "lg" }), "bg-white text-ink hover:bg-white/90")}
              >
                J&apos;ai déjà un compte
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line-soft">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-[12px] text-ink-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo />
          <p>© 2026 SRC Digital · Ouagadougou, Burkina Faso</p>
        </div>
      </footer>
    </>
  );
}
