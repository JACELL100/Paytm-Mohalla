"use client";

import Link from "next/link";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/format";

const LINKS = [
  { href: "#problem", label: "Problem" },
  { href: "#how", label: "How it works" },
  { href: "#trust", label: "Trust" },
  { href: "#paytm", label: "For Paytm" },
];

export function Nav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 12));

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <nav
        aria-label="Main"
        className={cn(
          "mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl px-3 pl-4 transition-[background-color,box-shadow,backdrop-filter] duration-500",
          scrolled ? "glass hairline shadow-[var(--shadow-soft)]" : "bg-transparent",
        )}
      >
        <Link href="/" aria-label="Mohalla home" className="rounded-lg">
          <Logo size={28} />
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="rounded-full px-3.5 py-2 text-[14px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1.5">
          <Link
            href="/ops"
            className="hidden rounded-full px-3.5 py-2 text-[14px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink sm:inline-flex"
          >
            Ops console
          </Link>
          <motion.span whileTap={{ scale: 0.97 }} className="inline-flex">
            <Link
              href="/login"
              className="group inline-flex h-9 items-center gap-1.5 rounded-full bg-navy px-4 text-[13.5px] font-medium text-white shadow-[0_8px_20px_-8px_rgba(0,46,110,0.6)] transition-colors hover:bg-navy-2"
            >
              <span className="hidden sm:inline">Open the live demo</span>
              <span className="sm:hidden">Live demo</span>
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </motion.span>
        </div>
      </nav>
    </header>
  );
}
