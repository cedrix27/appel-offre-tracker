import type { Metadata } from "next";
import { AdminFrame } from "@/components/app/frames";

export const metadata: Metadata = {
  title: { default: "Administration", template: "%s · Administration SRC Digital" },
  robots: { index: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}
