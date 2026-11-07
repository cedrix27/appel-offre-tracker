import type { Metadata } from "next";
import { AlertsView } from "./alerts-view";

export const metadata: Metadata = { title: "Historique des alertes" };

export default function Page() {
  return <AlertsView />;
}
