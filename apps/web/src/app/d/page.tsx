import type { Metadata } from "next";
import { DistributorDashboard } from "@/components/distributor/DistributorDashboard";

export const metadata: Metadata = { title: "Distributor" };

export default function DistributorPage() {
  return <DistributorDashboard />;
}
