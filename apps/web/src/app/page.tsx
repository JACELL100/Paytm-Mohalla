import type { Metadata } from "next";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Trustless } from "@/components/landing/Trustless";
import { ForPaytm } from "@/components/landing/ForPaytm";
import { TechStrip } from "@/components/landing/TechStrip";
import { FinalCta, Footer } from "@/components/landing/FinalCta";

export const metadata: Metadata = {
  title: { absolute: "Mohalla — One kirana is small. Fifty kiranas buy like a supermarket chain." },
};

export default function LandingPage() {
  return (
    <div className="overflow-x-clip bg-bg">
      <SmoothScroll />
      <Nav />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Trustless />
        <ForPaytm />
        <TechStrip />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
