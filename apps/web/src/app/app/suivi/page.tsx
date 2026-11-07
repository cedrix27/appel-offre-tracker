import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/states";
import { TrackingView } from "./tracking-view";

export const metadata: Metadata = { title: "Favoris & suivi" };

export default function TrackingPage() {
  return (
    <Suspense fallback={<LoadingBlock rows={3} />}>
      <TrackingView />
    </Suspense>
  );
}
