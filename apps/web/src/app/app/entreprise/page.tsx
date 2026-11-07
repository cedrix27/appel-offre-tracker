import type { Metadata } from "next";
import { CompanyView } from "./company-view";

export const metadata: Metadata = { title: "Entreprise" };

export default function Page() {
  return <CompanyView />;
}
