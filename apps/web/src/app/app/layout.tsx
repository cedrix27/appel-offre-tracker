import type { Metadata } from "next";
import { AppFrame } from "@/components/app/frames";

export const metadata: Metadata = {
  title: { default: "Espace entreprise", template: "%s · SRC Digital" },
  robots: { index: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
