import type { Metadata } from "next";
import { OpsConsole } from "@/components/ops/OpsConsole";

export const metadata: Metadata = { title: "Paytm Ops" };

export default function OpsPage() {
  return <OpsConsole />;
}
