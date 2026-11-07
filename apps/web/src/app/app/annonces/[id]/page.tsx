import type { Metadata } from "next";
import { TenderDetailView } from "./tender-detail-view";

export const metadata: Metadata = { title: "Fiche annonce" };

export default async function TenderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TenderDetailView id={id} />;
}
