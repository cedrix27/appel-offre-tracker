import type { Metadata } from "next";
import { AdminOverview } from "./overview-view";

export const metadata: Metadata = { title: "Vue d'ensemble" };

export default function AdminPage() {
  return <AdminOverview />;
}
