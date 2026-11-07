import { Logo } from "@/components/site-header";

/** Mise en page commune aux écrans d'authentification. */
export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10">
      <Logo />
      <div className="mt-8 w-full max-w-[420px] animate-fade-up rounded-[22px] border border-line bg-surface p-6 sm:p-8">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-[26px] leading-tight tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 text-[13px] text-ink-3">{description}</p>
        <p className="mt-5 rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-[12px] text-warning">
          Aperçu de l&apos;interface : le formulaire sera relié à l&apos;API lors de l&apos;étape « Authentification ».
        </p>
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-[13px] text-ink-3">{footer}</div>}
    </main>
  );
}
