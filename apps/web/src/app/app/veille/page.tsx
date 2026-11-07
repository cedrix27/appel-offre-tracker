import type { Metadata } from "next";
import { PreferencesView } from "./preferences-view";

export const metadata: Metadata = { title: "Préférences de veille" };

export default function Page() {
  return <PreferencesView />;
}
