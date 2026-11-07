import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/states";
import { TendersView } from "./tenders-view";

export const metadata: Metadata = { title: "Annonces" };

export default function TendersPage() {
  return (
    <Suspense fallback={<LoadingBlock rows={3} />}>
      <TendersView />
    </Suspense>
  );
}
